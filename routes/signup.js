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
const { signupValidation, handleValidationErrors } = require('../middleware/validation');
const Conversation = require('../models/conversation');
const { grantTrial, TRIAL_DAYS } = require('../utils/trialGrant');
const { recordConversionEvent } = require('../utils/conversionEvents');
const { generateUniqueUsername } = require('../auth/passport-config');

const { anyRole, userHasRole } = require('../utils/roleQuery');
const { parseDateOfBirth } = require('../utils/dob');
// Roles that can be self-assigned during public signup.
// 'admin' and 'teacher' are intentionally excluded — these accounts must be created by existing admins.
const SELF_REGISTERABLE_ROLES = ['student', 'parent'];

// Check if a code is in the ENROLLMENT_CODES env var (comma-separated, case-insensitive)
function isEnvEnrollmentCode(code) {
    const envCodes = process.env.ENROLLMENT_CODES;
    if (!envCodes) return false;
    const codeList = envCodes.split(',').map(c => c.trim().toUpperCase());
    return codeList.includes(code.toUpperCase().trim());
}

/**
 * @route   POST /signup/validate-code
 * @desc    Validate an enrollment code before signup
 * @access  Public
 */
router.post('/validate-code', async (req, res) => {
    try {
        const { code } = req.body;

        if (!code) {
            return res.status(400).json({ valid: false, message: 'Enrollment code is required.' });
        }

        const enrollmentCode = await EnrollmentCode.findOne({ code: code.toUpperCase().trim() })
            .populate('teacherId', 'firstName lastName');

        if (!enrollmentCode) {
            // Fallback: check ENROLLMENT_CODES env var for open registration codes
            if (isEnvEnrollmentCode(code)) {
                return res.json({
                    valid: true,
                    enrollmentCode: {
                        className: 'Open Registration',
                        teacherName: '',
                        gradeLevel: '',
                        mathCourse: ''
                    }
                });
            }
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

router.post('/', ensureNotAuthenticated, signupValidation, handleValidationErrors, async (req, res, next) => {
    const { firstName, lastName, email, password, role, enrollmentCode, inviteCode, parentInviteCode, parentInviteToken, dateOfBirth, termsAccepted } = req.body;

    // --- 1. Basic Validation ---
    if (!firstName || !lastName || !email || !password || !role) {
        console.warn("WARN: Signup failed - missing basic fields.");
        return res.status(400).json({ message: 'All basic fields are required.' });
    }

    // SECURITY: Prevent privilege escalation — only allow self-registerable roles
    if (!SELF_REGISTERABLE_ROLES.includes(role)) {
        console.warn(`WARN: Signup blocked - attempted self-registration with disallowed role: '${role}'`);
        // Teacher is the role people actually try, and it is blocked on purpose:
        // a teacher account carries rosters and IEP data, so an admin provisions
        // it. Say where to go instead of a dead-end "invalid".
        const message = role === 'teacher'
            ? 'Teacher accounts are set up by our team so we can verify your school. Request one at /contact-support.html and we will get you started.'
            : 'Invalid role for self-registration.';
        return res.status(403).json({ message });
    }

    // Terms of Use / Privacy Policy acceptance is required
    if (!termsAccepted) {
        return res.status(400).json({ message: 'You must agree to the Terms of Use and Privacy Policy.' });
    }

    // Note: DOB is collected at complete-profile page, not signup.
    // COPPA check happens there - under 13 must have parental consent to complete profile.
    // Parent invite code at signup is optional but allows pre-linking for convenience.

    // Password strength validation (should match frontend)
    const passwordRegex = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d).{8,}$/;
    if (!passwordRegex.test(password)) {
        console.warn("WARN: Signup failed - weak password.");
        return res.status(400).json({ message: 'Password must be at least 8 characters long and include one uppercase letter, one lowercase letter, and one number.' });
    }

    try {
        // --- 2. Check for existing Email ---
        let existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            console.warn(`WARN: Signup failed - email '${email}' already registered.`);
            return res.status(409).json({ message: 'Email already registered.' });
        }

        // Auto-generate a unique username from the user's name
        const username = await generateUniqueUsername(`${firstName} ${lastName}`, email.split('@')[0]);

        // --- 3. Process Enrollment Code (if provided for students) ---
        let enrollmentCodeDoc = null;
        let teacherIdFromCode = null;
        let gradeLevelFromCode = null;
        let mathCourseFromCode = null;
        let subscriptionTierFromCode = null;

        if (role === 'student' && enrollmentCode && enrollmentCode.trim()) {
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
                    subscriptionTierFromCode = enrollmentCodeDoc.defaultSubscriptionTier || 'free';
                    console.log(`LOG: Student using enrollment code ${enrollmentCode} for teacher ${teacherIdFromCode} (tier: ${subscriptionTierFromCode})`);
                } else {
                    console.warn(`WARN: Student tried to use invalid enrollment code: ${enrollmentCode} - ${validation.reason}`);
                    // Don't fail signup, just don't link to teacher
                    enrollmentCodeDoc = null;
                }
            } else if (isEnvEnrollmentCode(enrollmentCode)) {
                // Code is in ENROLLMENT_CODES env var — valid for open registration (no teacher link)
                console.log(`LOG: Student using env-based enrollment code: ${enrollmentCode}`);
            } else {
                console.warn(`WARN: Student signed up with unrecognized enrollment code: ${enrollmentCode} — proceeding without class link.`);
                // Don't block signup — student proceeds as free-tier without a teacher link
            }
        }

        // --- 4. Create New User ---
        // Generate email verification token
        const verificationToken = crypto.randomBytes(32).toString('hex');
        const hashedToken = crypto.createHash('sha256').update(verificationToken).digest('hex');

        // Parents/teachers/admins don't need DOB or grade-level info, so they
        // can skip the legacy complete-profile screen. The voice-first
        // onboarding screen handles them with the open-ended question and
        // routes straight to their dashboard. Students stay gated until
        // DOB (and, if minor, parental consent) are captured on onboarding.
        const skipProfileGate = (role !== 'student');

        // Persist a plausible DOB when supplied. This field was destructured
        // from the body and then silently discarded — every downstream age
        // gate (COPPA consent, under-13 voice block) ran blind because of it.
        // Invalid values are ignored rather than failing signup; the in-chat
        // DOB prompt re-collects later.
        const parsedDob = dateOfBirth ? parseDateOfBirth(dateOfBirth) : null;

        const newUser = new User({
            firstName,
            lastName,
            email: email.toLowerCase(),
            username: username.toLowerCase(),
            passwordHash: password, // The pre-save hook in models/user.js will hash this
            role,
            needsProfileCompletion: !skipProfileGate,
            termsAcceptedAt: new Date(),
            ...(parsedDob && parsedDob.date ? { dateOfBirth: parsedDob.date } : {}),
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
            // Apply subscription tier from enrollment code if set (e.g. 'unlimited' for teacher classes)
            ...(subscriptionTierFromCode && subscriptionTierFromCode !== 'free' ? { subscriptionTier: subscriptionTierFromCode } : {}),
            // NOT pre-set from the preview any more. The anonymous preview runs on
            // one fixed tutor (Mr. Nappier), so carrying that choice forward would
            // hand every new student a tutor they never chose AND skip the picker,
            // since the redirect below only sends students there when
            // selectedTutorId is empty. Choosing a tutor is now the first thing a
            // new account does — a reward for signing up rather than a decision
            // demanded of a stranger who has not experienced anything yet.
            // Auto-assign default DiceBear avatar (no more pick-avatar onboarding step)
            selectedAvatarId: 'dicebear-default',
            avatar: {
                dicebearConfig: {
                    style: 'adventurer',
                    seed: firstName ? firstName.toLowerCase() : username.toLowerCase(),
                },
                dicebearUrl: `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent((firstName || username).toLowerCase())}`
            },
            // Default values for other fields (e.g., XP, level) will come from the schema defaults
        });

        // --- PREVIEW -> TRIAL handoff -------------------------------------
        // Read the preview transcript BEFORE req.logIn() further down: passport
        // may regenerate the session on login, and everything the anonymous
        // visitor did lives in that session.
        const previewTranscript = Array.isArray(req.session?.trialTranscript)
            ? req.session.trialTranscript
            : [];

        // Grant the no-card trial. Students only: teachers, parents and admins
        // already pass every gate via hasStaffRoleBypass, so a trial on those
        // accounts would grant nothing and pollute trial_started with rows that
        // can never convert. See utils/trialGrant.js.
        //
        // userHasRole, not `newUser.role`: this decides an ENTITLEMENT, which
        // CLAUDE.md §12 puts squarely on roles held. The two agree on an account
        // created three lines ago, which is exactly why the wrong one would sit
        // here unnoticed until the day signup can mint more than one role.
        const grantedTrial = userHasRole(newUser, 'student') && grantTrial(newUser);

        await newUser.save(); // Save the new user to MongoDB

        // Restore the preview conversation so the wall's promise — "your
        // conversation continues right where you left off" — is literally true.
        // Best-effort: a signup must never fail because the carryover did.
        if (previewTranscript.length) {
            try {
                const conversation = await Conversation.create({
                    userId: newUser._id,
                    messages: previewTranscript.map((m) => ({
                        role: m.role === 'user' ? 'user' : 'assistant',
                        content: m.content,
                        ...(m.tutorId ? { tutorId: m.tutorId } : {}),
                    })),
                    lastActivity: new Date(),
                });
                // Both resolution paths: some surfaces read the user's pointer,
                // others take the most recent active conversation.
                newUser.activeConversationId = conversation._id;
                await newUser.save();
                // Consumed — a second signup in this browser must not re-import it.
                if (req.session) {
                    delete req.session.trialTranscript;
                    delete req.session.trialTurns;
                }
            } catch (convErr) {
                console.error('ERROR: Failed to carry preview conversation into signup:', convErr);
            }
        }

        recordConversionEvent('signup_started', {
            userId: newUser._id,
            context: { role: newUser.role, carriedPreview: previewTranscript.length > 0 },
        });
        if (grantedTrial) {
            recordConversionEvent('trial_started', {
                userId: newUser._id,
                context: { trialDays: TRIAL_DAYS, carriedPreview: previewTranscript.length > 0 },
            });
        }

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
                ...anyRole('student')
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
                ...anyRole('parent')
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

        // --- 5c. Handle student-initiated parent invite ---
        // A parent who signed up via the kid's "add a parent" email carries a
        // parentInviteToken; auto-link them to that student (and grant consent).
        if (role === 'parent' && parentInviteToken) {
            const invitedStudent = await User.findOne({
                'parentInvite.token': parentInviteToken,
                ...anyRole('student')
            });
            if (invitedStudent) {
                newUser.children = newUser.children || [];
                if (!newUser.children.some(childId => childId.equals(invitedStudent._id))) {
                    newUser.children.push(invitedStudent._id);
                }
                invitedStudent.parentIds = invitedStudent.parentIds || [];
                if (!invitedStudent.parentIds.some(pid => pid.equals(newUser._id))) {
                    invitedStudent.parentIds.push(newUser._id);
                }
                invitedStudent.hasParentalConsent = true;
                invitedStudent.parentInvite = { email: null, token: null, sentAt: null }; // consume the invite
                await newUser.save();
                await invitedStudent.save();
                console.log(`LOG: Parent ${newUser.username} auto-linked to student ${invitedStudent.username} via parent invite token.`);
            } else {
                console.warn(`WARN: Parent ${newUser.username} signed up with an invalid or already-used parent invite token.`);
            }
        }

        // --- 6. Log the user in immediately after signup ---
        // This avoids making the user log in again right after registering.
        // Set lastLogin on first signup auto-login
        try {
            await User.findByIdAndUpdate(newUser._id, { lastLogin: new Date() });
        } catch (updateErr) {
            console.error("ERROR: Failed to update lastLogin on signup:", updateErr);
        }

        req.logIn(newUser, (err) => {
            if (err) {
                console.error('ERROR: Error logging in after signup:', err);
                // If auto-login fails, still inform about successful signup
                return res.status(500).json({ success: true, message: 'Account created successfully, but auto-login failed. Please try logging in manually.' });
            }
            // --- 7. Determine Redirect URL ---
            // New users always start with voice-first onboarding (open-ended
            // "What brings you to Mathmatix today?"). After answering, the
            // onboarding page routes them to complete-profile / pick-tutor.
            let redirectUrl = '/onboarding.html';
            // `newUser.role` — the ACTIVE role — is deliberate: acting-user
            // dashboard routing on an account created seconds ago with exactly
            // one role, the one job CLAUDE.md §12 keeps `role` for.
            if (!newUser.needsProfileCompletion && newUser.role === 'student' && !newUser.selectedTutorId) {
                redirectUrl = '/pick-tutor.html'; // Student needs to pick a tutor
            }
            // Other roles redirect to their dashboards if profile completion not needed
            // (though needsProfileCompletion should handle most of this flow)
            console.log(`LOG: New user ${newUser.username} signed up and logged in. Redirecting to: ${redirectUrl}`);

            // Persist session to MongoDB before responding to prevent race condition
            req.session.save((saveErr) => {
                if (saveErr) {
                    console.error("ERROR: Failed to save session after signup:", saveErr);
                    return res.status(500).json({ success: true, message: 'Account created, but session save failed. Please try logging in.' });
                }
                // Same marker the OAuth callbacks set (config/routes.js
                // setSignupMethodCookie): analytics.js on the next page fires
                // GA4 sign_up with the method, then clears the cookie.
                res.cookie('mm_signup_method', 'email', {
                    httpOnly: false,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'lax',
                    maxAge: 10 * 60 * 1000
                });
                res.status(201).json({ success: true, message: 'Account created successfully!', redirect: redirectUrl });
            });
        });

    } catch (error) {
        console.error('ERROR: Signup failed:', error);
        // Catch Mongoose duplicate key errors (code 11000) for unique fields
        if (error.code === 11000 && error.keyPattern) {
            if (error.keyPattern.email) {
                return res.status(409).json({ message: 'Email already registered.' });
            }
            if (error.keyPattern.username) {
                return res.status(409).json({ message: 'Please try again — a username conflict occurred.' });
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