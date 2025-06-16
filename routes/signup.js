// routes/signup.js (backend route)
const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const passport = require("passport");
const User = require("../models/User");

// Helper to generate a unique short code (reused from parent.js concept)
function generateUniqueLinkCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) { // Generate a 6-character code
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

router.post("/", async (req, res) => {
  const { firstName, lastName, email, username, password, role, inviteCode } = req.body; // 'inviteCode' here refers to the single input field on the signup form

  // Basic validation
  if (!firstName || !lastName || !email || !username || !password || !role) {
    return res.status(400).json({ message: "All fields are required." });
  }

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
      needsProfileCompletion: true, // Default: most new signups need profile completion
    });

    // --- MODIFIED: Handle inviteCode based on role and existence ---
    if (inviteCode && inviteCode.trim() !== '') {
        if (role === 'student') {
            // Student using a parent's invite code (parentToChildInviteCode)
            const parentUser = await User.findOne({ 'parentToChildInviteCode.code': inviteCode.trim() });

            if (!parentUser) {
                return res.status(400).json({ message: "Invalid invite code. Please check with your parent or try again." });
            }
            if (parentUser.parentToChildInviteCode.childLinked) {
                return res.status(400).json({ message: "This invite code has already been used by a child." });
            }
            if (parentUser.role !== 'parent') {
                return res.status(400).json({ message: "Invite code is not from a parent account." });
            }
            if (parentUser.parentToChildInviteCode.expiresAt < new Date()) {
                 return res.status(400).json({ message: "Invite code has expired." });
            }

            // Link student to parent
            newUser.teacherId = parentUser._id; // Using teacherId as parentId link
            parentUser.children = parentUser.children || [];
            parentUser.children.push(newUser._id);
            parentUser.parentToChildInviteCode.childLinked = true; // Mark code as used on the parent's record
            await parentUser.save();

            newUser.needsProfileCompletion = false; // Profile complete if linked via code at signup
            console.log(`LOG: Student ${newUser.username} linked to parent ${parentUser.username} via parent's invite code.`);

        } else if (role === 'parent') {
            // Parent using a student's link code (studentToParentLinkCode)
            const studentUser = await User.findOne({ 'studentToParentLinkCode.code': inviteCode.trim() });

            if (!studentUser) {
                return res.status(400).json({ message: "Invalid student link code. Please check the code." });
            }
            if (studentUser.studentToParentLinkCode.parentLinked) {
                return res.status(400).json({ message: "This student code is already linked to a parent." });
            }
            if (studentUser.role !== 'student') {
                return res.status(400).json({ message: "This code is not from a student account." });
            }

            // Link parent to student
            studentUser.teacherId = newUser._id; // Link student's parent ID to new parent's _id
            newUser.children = newUser.children || [];
            newUser.children.push(studentUser._id); // Add student's _id to new parent's children array
            studentUser.studentToParentLinkCode.parentLinked = true; // Mark code as used on the student's record
            await studentUser.save();

            newUser.needsProfileCompletion = false; // Parent profile complete if linked via code at signup
            console.log(`LOG: Parent ${newUser.username} linked to student ${studentUser.username} via student's link code.`);
        }
    }

    // If it's a student signing up without an invite code (or a teacher/admin), auto-generate a studentToParentLinkCode for them
    if (role === 'student' && (!inviteCode || inviteCode.trim() === '')) {
        let newLinkCode;
        let codeExists = true;
        while (codeExists) { // Ensure uniqueness
            newLinkCode = generateUniqueLinkCode();
            const existingUserWithCode = await User.findOne({ 'studentToParentLinkCode.code': newLinkCode });
            if (!existingUserWithCode) {
                codeExists = false;
            }
        }
        newUser.studentToParentLinkCode = { code: newLinkCode, parentLinked: false };
        console.log(`LOG: New student ${newUser.username} assigned parent link code: ${newLinkCode}`);
    }
    // --- END MODIFIED INVITE CODE HANDLING ---


    await newUser.save(); // Save the new user

    // Set up session for the new user (Passport.js req.logIn)
    req.logIn(newUser, (loginErr) => {
        if (loginErr) {
            console.error("ERROR: Signup login error:", loginErr);
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