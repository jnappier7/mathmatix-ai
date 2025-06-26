// routes/signup.js (backend route)
const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const passport = require("passport");
const User = require("../models/user");

// Helper to generate a unique short code (reused from parent.js concept)
function generateUniqueLinkCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) { // Generate a 6-character code
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `MATH-${result}`; // Prefix for readability
}

router.post("/", async (req, res, next) => { // Added 'next' for passport.authenticate
  const { firstName, lastName, email, username, password, role, inviteCode, enrollmentCode } = req.body; // NEW: Added enrollmentCode

  // Basic validation
  if (!firstName || !lastName || !email || !username || !password || !role || !enrollmentCode) { // NEW: enrollmentCode required
    return res.status(400).json({ message: "All fields, including Enrollment Code, are required." });
  }

  // --- NEW: Enrollment Code Validation ---
  const validEnrollmentCodes = process.env.ENROLLMENT_CODES ? process.env.ENROLLMENT_CODES.split(',') : [];
  // For quick local testing, you can hardcode some codes if .env is not set up yet:
  // const validEnrollmentCodes = ["TESTCODE123", "MATHMATIX2025"]; 

  if (!validEnrollmentCodes.includes(enrollmentCode)) {
      return res.status(403).json({ message: "Invalid Enrollment Code. Please check your code and try again." });
  }
  // --- END NEW: Enrollment Code Validation ---


  try {
    // Check if username or email already exists
    let existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser) {
      return res.status(409).json({ message: "Username or email already exists." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      firstName,
      lastName,
      name: `${firstName} ${lastName}`,
      email,
      username,
      passwordHash: hashedPassword,
      role,
      needsProfileCompletion: true, // New users typically need profile completion
      // Initialize XP and level for new users
      xp: 0,
      level: 1,
      // Initialize other fields as default
      conversations: [],
      iepPlan: {},
      parentToChildInviteCode: { code: await generateUniqueLinkCode(), expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), childLinked: false }, // Generate student's own invite code
      studentToParentLinkCode: { parentLinked: false }
    });

    // If role is parent and an inviteCode for a child is provided, attempt to link
    if (role === 'parent' && inviteCode) {
        const studentToLink = await User.findOne({ 'parentToChildInviteCode.code': inviteCode });
        if (studentToLink && studentToLink.role === 'student' && !studentToLink.parentToChildInviteCode.childLinked) {
            newUser.children.push(studentToLink._id); // Link parent to student
            studentToLink.parentToChildInviteCode.childLinked = true; // Mark student's code as used
            studentToLink.teacherId = newUser._id; // Assign parent as "teacher" for linking purposes
            await studentToLink.save();
            console.log(`LOG: New parent account linked to student ${studentToLink.username}`);
        } else {
            return res.status(400).json({ message: "Invalid or already used Child Invite Code." });
        }
    }

    await newUser.save();

    // After successful signup and user creation, log the user in
    // This uses Passport's req.logIn to establish a session directly
    req.logIn(newUser, (err) => {
        if (err) {
            console.error("Signup req.logIn error:", err);
            return res.status(500).json({ error: "Failed to establish session after signup." });
        }

        let redirectUrl = '/chat.html'; // Default redirect
        if (newUser.role === 'student') {
            redirectUrl = newUser.needsProfileCompletion ? '/complete-profile.html' : '/pick-tutor.html'; // If linked, they don't need profile complete page
        } else if (newUser.role === 'teacher') {
            redirectUrl = '/teacher-dashboard.html';
        } else if (newUser.role === 'admin') {
            redirectUrl = '/admin-dashboard.html';
        } else if (newUser.role === 'parent') {
            redirectUrl = '/parent-dashboard.html';
        }
        
        console.log(`Signup successful for ${newUser.username}, redirecting to ${redirectUrl}`);
        res.status(201).json({ success: true, message: "Signup successful!", redirect: redirectUrl });
    });

  } catch (err) {
    console.error("Signup Error:", err);
    if (err.name === 'ValidationError') {
        const messages = Object.values(err.errors).map(val => val.message);
        return res.status(400).json({ message: `Validation failed: ${messages.join(', ')}` });
    }
    if (err.code === 11000) {
        let field = Object.keys(err.keyValue)[0];
        let value = err.keyValue[field];
        return res.status(409).json({ message: `A user with that ${field} (${value}) already exists.` });
    }
    res.status(500).json({ message: "An unexpected error occurred during signup." });
  }
});

module.exports = router;