const express = require('express');
const router = express.Router();
const Waitlist = require('../models/waitlist');
const { sendWaitlistConfirmation } = require('../utils/emailService');

// POST /api/waitlist — add an email to the pre-launch waitlist
router.post('/', async (req, res) => {
  try {
    const { email, role } = req.body;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const validRole = ['student', 'parent', 'teacher'].includes(role) ? role : 'other';

    const existing = await Waitlist.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(200).json({ success: true, message: "You're already on the list! We'll be in touch." });
    }

    await Waitlist.create({
      email: normalizedEmail,
      role: validRole
    });

    // Send confirmation email (non-blocking — don't fail the signup if email fails)
    sendWaitlistConfirmation(normalizedEmail, validRole).catch(function (err) {
      console.error('Waitlist confirmation email failed (non-blocking):', err.message);
    });

    res.status(201).json({ success: true, message: "You're on the list! We'll notify you on launch day." });
  } catch (err) {
    console.error('ERROR: Waitlist signup failed:', err);
    res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
});

module.exports = router;
