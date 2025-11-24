// routes/signup.js - PHASE 1: Backend Routing & Core Setup - Batch 2
// Handles new user registration.

const express = require('express');
const router = express.Router();
const User = require('../models/user'); // Import the User model
const { ensureNotAuthenticated } = require('../middleware/auth'); // Middleware to ensure user is not already logged in
const passport = require('passport'); // For req.logIn after successful signup

router.post('/', ensureNotAuthenticated, async (req, res, next) => {
    const { firstName, lastName, email, username, password, role, enrollmentCode, inviteCode } = req.body;

    // --- 1. Basic Validation ---
    if (!firstName || !lastName || !email || !username || !password || !role) {
        console.warn("WARN: Signup failed - missing basic fields.");
        return res.status(400).json({ message: 'All basic fields are required.' });
    }

    if (role === 'parent' && !inviteCode) {
        console.warn("WARN: Signup failed - parent missing invite code.");
        return res.status(400).json({ message: 'Parent accounts require a child invite code.' });
    }

    // Password strength validation (should match frontend)
    // SECURITY FIX: Strengthened password requirements to include special characters
    const passwordRegex = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[@$!%*?&#^()_+\-=\[\]{};':"\\|,.<>\/]).{8,}$/;
    if (!passwordRegex.test(password)) {
        console.warn("WARN: Signup failed - weak password.");
        return res.status(400).json({ message: 'Password must be at least 8 characters long and include one uppercase letter, one lowercase letter, one number, and one special character.' });
    }

    try {
        // --- 2. Check for existing Username/Email ---
        let existingUser = await User.findOne({ $or: [{ username: username.toLowerCase() }, { email: email.toLowerCase() }] });
        if (existingUser) {
            if (existingUser.username === username.toLowerCase()) {
                console.warn(`WARN: Signup failed - username '${username}' already taken.`);
                return res.status(409).json({ message: 'Username already taken.' });
            }
            if (existingUser.email === email.toLowerCase()) {
                console.warn(`WARN: Signup failed - email '${email}' already registered.`);
                return res.status(409).json({ message: 'Email already registered.' });
            }
        }

        // --- 3. Create New User ---
        const newUser = new User({
            firstName,
            lastName,
            email: email.toLowerCase(),
            username: username.toLowerCase(),
            passwordHash: password, // The pre-save hook in models/user.js will hash this
            role,
            needsProfileCompletion: true, // New users need to complete their profile
            // Default values for other fields (e.g., XP, level) will come from the schema defaults
        });

        await newUser.save(); // Save the new user to MongoDB

        // --- 4. Handle Parent-Child Linking (if parent signup) ---
        if (role === 'parent' && inviteCode) {
            // Find a student with a matching, unlinked invite code
            const studentUser = await User.findOne({
                'studentToParentLinkCode.code': inviteCode.trim(),
                'studentToParentLinkCode.parentLinked': false,
                role: 'student'
            });

            if (studentUser) {
                // Link the student to the new parent
                newUser.children = newUser.children || [];
                if (!newUser.children.some(childId => childId.equals(studentUser._id))) { // Prevent duplicate links
                    newUser.children.push(studentUser._id);
                }
                studentUser.studentToParentLinkCode.parentLinked = true; // Mark student's code as used
                studentUser.teacherId = newUser._id; // Assign parent as "teacher" for this student
                
                await newUser.save(); // Save parent with new child reference
                await studentUser.save(); // Save student with updated link status and teacherId
                console.log(`LOG: Parent ${newUser.username} linked to student ${studentUser.username} via invite code.`);
            } else {
                console.warn(`WARN: Parent ${newUser.username} signed up with invalid or already used invite code: ${inviteCode}.`);
                // Decide how to handle this: still create parent account, or prevent it?
                // For now, parent account is still created, but linking failed.
            }
        }

        // --- 5. Log the user in immediately after signup ---
        // This avoids making the user log in again right after registering.
        req.logIn(newUser, (err) => {
            if (err) {
                console.error('ERROR: Error logging in after signup:', err);
                // If auto-login fails, still inform about successful signup
                return res.status(500).json({ success: true, message: 'Account created successfully, but auto-login failed. Please try logging in manually.' });
            }
            // --- 6. Determine Redirect URL ---
            let redirectUrl = '/complete-profile.html'; // Default for new users
            if (newUser.role === 'student' && !newUser.selectedTutorId) {
                redirectUrl = '/pick-tutor.html'; // Student needs to pick a tutor
            }
            // Other roles redirect to their dashboards if profile completion not needed
            // (though needsProfileCompletion should handle most of this flow)
            console.log(`LOG: New user ${newUser.username} signed up and logged in. Redirecting to: ${redirectUrl}`);
            res.status(201).json({ success: true, message: 'Account created successfully!', redirect: redirectUrl });
        });

    } catch (error) {
        console.error('ERROR: Signup failed:', error);
        // Catch Mongoose duplicate key errors (code 11000) for unique fields like username/email
        if (error.code === 11000 && error.keyPattern) {
            if (error.keyPattern.username) {
                return res.status(409).json({ message: 'Username already taken.' });
            }
            if (error.keyPattern.email) {
                return res.status(409).json({ message: 'Email already registered.' });
            }
        }
        res.status(500).json({ message: 'An unexpected server error occurred during signup.' });
    }
});

// Optionally, add a GET /signup route for API debugging if needed.
router.get('/', (req, res) => {
    res.status(200).json({ message: 'Signup API endpoint. Please send POST request to register.' });
});

module.exports = router;