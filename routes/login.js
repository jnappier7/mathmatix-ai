// login.js (backend route)
const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const User = require("../models/User");

router.post("/", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    req.session.userId = user._id;

    user.lastLogin = Date.now();
    await user.save();

    res.status(200).json({
      message: "Login successful!",
      user: {
        _id: user._id,
        username: user.username,
        name: user.name,
        gradeLevel: user.gradeLevel,
        mathCourse: user.mathCourse,
        learningStyle: user.learningStyle,
        tonePreference: user.tonePreference,
        interests: user.interests,
        // --- ADDED THIS LINE ---
        role: user.role, // Include the user's role here!
        // --- END ADDITION ---
      },
    });
  } catch (err) {
    console.error("ERROR: Login error:", err);
    res.status(500).json({ error: "Login failed" });
  }
});

module.exports = router;