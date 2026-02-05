// routes/signup.js - PHASE 1: Backend Routing & Core Setup - Batch 2
// Handles new user registration.

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const User = require('../models/user'); // Import the User model
const EnrollmentCode = require('../models/enrollmentCode'); // For class enrollment codes
const { ensureNotAuthenticated } = require('../middleware/auth'); // Middleware to ensure user is not already logged in
const passport = require('passport'); // For req.logIn after successful signup
const { sendEmailVerification } = require('../utils/emailService'); // For email verification

/**
 * @route   GET /signup/validate-code
 * @desc    Validate an enrollment code before signup
 * @access  Public
 */
router.get('/validate-code', async (req, res) => {
    try {
        const { code } = req.query;

        if (!code) {
            return res.status(400).json({ valid: false, message: 'Enrollment code is required.' });
        }

        const enrollmentCode = await EnrollmentCode.findOne({ code: code.toUpperCase().trim() })
            .populate('teacherId', 'firstName lastName');

        if (!enrollmentCode) {
            return res.status(404).json({ valid: false, message: 'Invalid enrollment code.' });
        }

        // Check if code is valid for use
        const validation = enrollmentCode.isValidForUse();
        if (!validation.valid) {
            return res.status(400).json({ valid: false, message: validation.reason });
        }

        // Return code info (without sensitive data)
        res.json({
            valid: true,
            enrollmentCode: {
                className: enrollmentCode.className,
                teacherName: enrollmentCode.teacherId
                    ? `${enrollmentCode.teacherId.firstName} ${enrollmentCode.teacherId.lastName}`
                    : 'Unknown Teacher',
                gradeLevel: enrollmentCode.gradeLevel,
                mathCourse: enrollmentCode.mathCourse
            }
        });

    } catch (error) {
        console.error('ERROR: Enrollment code validation failed:', error);
        res.status(500).json({ valid: false, message: 'Server error validating enrollment code.' });
    }
});

router.post('/', ensureNotAuthenticated, async (req, res, next) => {
    const { firstName, lastName, email, username, password, role, enrollmentCode, inviteCode, parentInviteCode, dateOfBirth } = req.body;

    // --- 1. Basic Validation ---
    if (!firstName || !lastName || !email || !username || !password || !role) {
        console.warn("WARN: Signup failed - missing basic fields.");
        return res.status(400).json({ message: 'All basic fields are required.' });
    }

    // Note: DOB is collected at complete-profile page, not signup.
    // COPPA check happens there - under 13 must have parental consent to complete profile.
    // Parent invite code at signup is optional but allows pre-linking for convenience.

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

        // --- 3. Process Enrollment Code (if provided for students) ---
        let enrollmentCodeDoc = null;
        let teacherIdFromCode = null;
        let gradeLevelFromCode = null;
        let mathCourseFromCode = null;

        if (role === 'student' && enrollmentCode) {
            enrollmentCodeDoc = await EnrollmentCode.findOne({
                code: enrollmentCode.toUpperCase().trim()
            });

            if (enrollmentCodeDoc) {
                // Validate the code is still usable
                const validation = enrollmentCodeDoc.isValidForUse();
                if (validation.valid) {
                    teacherIdFromCode = enrollmentCodeDoc.teacherId;
                    gradeLevelFromCode = enrollmentCodeDoc.gradeLevel;
                    mathCourseFromCode = enrollmentCodeDoc.mathCourse;
                    console.log(`LOG: Student using enrollment code ${enrollmentCode} for teacher ${teacherIdFromCode}`);
                } else {
                    console.warn(`WARN: Student tried to use invalid enrollment code: ${enrollmentCode} - ${validation.reason}`);
                    // Don't fail signup, just don't link to teacher
                    enrollmentCodeDoc = null;
                }
            } else {
                console.warn(`WARN: Student signed up with non-existent enrollment code: ${enrollmentCode}`);
            }
        }

        // --- 4. Create New User ---
        // Generate email verification token
        const verificationToken = crypto.randomBytes(32).toString('hex');
        const hashedToken = crypto.createHash('sha256').update(verificationToken).digest('hex');

        const newUser = new User({
            firstName,
            lastName,
            email: email.toLowerCase(),
            username: username.toLowerCase(),
            passwordHash: password, // The pre-save hook in models/user.js will hash this
            role,
            needsProfileCompletion: true, // New users need to complete their profile
            // Email verification
            emailVerified: false,
            emailVerificationToken: hashedToken,
            emailVerificationExpires: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
            // Assign teacher from enrollment code if available
            ...(teacherIdFromCode ? { teacherId: teacherIdFromCode } : {}),
            // Use grade level from enrollment code if available
            ...(gradeLevelFromCode ? { gradeLevel: gradeLevelFromCode } : {}),
            // Use math course from enrollment code if available
            ...(mathCourseFromCode ? { mathCourse: mathCourseFromCode } : {}),
            // Default values for other fields (e.g., XP, level) will come from the schema defaults
        });

        await newUser.save(); // Save the new user to MongoDB

        // Send verification email (non-blocking - don't fail signup if email fails)
        sendEmailVerification(newUser.email, newUser.firstName, verificationToken)
            .then(result => {
                if (result.success) {
                    console.log(`LOG: Verification email sent to ${newUser.email}`);
                } else {
                    console.warn(`WARN: Failed to send verification email to ${newUser.email}:`, result.error);
                }
            })
            .catch(err => {
                console.error(`ERROR: Failed to send verification email to ${newUser.email}:`, err);
            });

        // --- 4b. Record enrollment if code was used ---
        if (enrollmentCodeDoc) {
            try {
                await enrollmentCodeDoc.enrollStudent(newUser._id, 'self-signup');
                console.log(`LOG: Student ${newUser.username} enrolled via code ${enrollmentCodeDoc.code}`);
            } catch (enrollError) {
                console.error('ERROR: Failed to record enrollment:', enrollError);
                // Don't fail signup if enrollment tracking fails
            }
        }

        // --- 5. Handle Parent-Child Linking (if parent signup with child's invite code) ---
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

                // Add parent to student's parentIds array (supports multiple parents)
                studentUser.parentIds = studentUser.parentIds || [];
                if (!studentUser.parentIds.some(parentId => parentId.equals(newUser._id))) {
                    studentUser.parentIds.push(newUser._id);
                }

                // Grant parental consent since student is now linked to a parent
                studentUser.hasParentalConsent = true;

                await newUser.save(); // Save parent with new child reference
                await studentUser.save(); // Save student with updated link status, parentIds, and consent
                console.log(`LOG: Parent ${newUser.username} linked to student ${studentUser.username} via invite code.`);
            } else {
                console.warn(`WARN: Parent ${newUser.username} signed up with invalid or already used invite code: ${inviteCode}.`);
                // Parent account is still created, but linking failed. They can link later.
            }
        }

        // --- 5b. Handle Student-Parent Linking (if student signup with parent's invite code) ---
        // This allows kids under 13 to sign up using a parent's invite code for COPPA compliance
        if (role === 'student' && parentInviteCode) {
            // Find a parent with a matching, valid invite code
            const parentUser = await User.findOne({
                'parentToChildInviteCode.code': parentInviteCode.trim().toUpperCase(),
                'parentToChildInviteCode.childLinked': false,
                'parentToChildInviteCode.expiresAt': { $gt: new Date() },
                role: 'parent'
            });

            if (parentUser) {
                // Link the new student to the parent
                parentUser.children = parentUser.children || [];
                if (!parentUser.children.some(childId => childId.equals(newUser._id))) {
                    parentUser.children.push(newUser._id);
                }
                parentUser.parentToChildInviteCode.childLinked = true; // Mark parent's code as used

                // Add parent to student's parentIds array
                newUser.parentIds = newUser.parentIds || [];
                if (!newUser.parentIds.some(parentId => parentId.equals(parentUser._id))) {
                    newUser.parentIds.push(parentUser._id);
                }

                // Grant parental consent since student is linked to a parent
                newUser.hasParentalConsent = true;

                await parentUser.save(); // Save parent with new child reference
                await newUser.save(); // Save student with parentIds and consent
                console.log(`LOG: Student ${newUser.username} linked to parent ${parentUser.username} via parent invite code.`);
            } else {
                console.warn(`WARN: Student ${newUser.username} signed up with invalid, expired, or already used parent invite code: ${parentInviteCode}.`);
                // Student account is still created, but linking failed. Parent can link later.
            }
        }

        // --- 6. Log the user in immediately after signup ---
        // This avoids making the user log in again right after registering.
        req.logIn(newUser, (err) => {
            if (err) {
                console.error('ERROR: Error logging in after signup:', err);
                // If auto-login fails, still inform about successful signup
                return res.status(500).json({ success: true, message: 'Account created successfully, but auto-login failed. Please try logging in manually.' });
            }
            // --- 7. Determine Redirect URL ---
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