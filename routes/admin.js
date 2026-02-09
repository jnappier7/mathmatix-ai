/**
 * M∆THM∆TIΧ AI - Admin API Routes
 *
 * This file contains all API endpoints for administrative functions.
 * All routes are protected by the `isAdmin` middleware.
 *
 * @version 2.0
 * @author Senior Developer
 */
const express = require('express');
const router = express.Router();
const User = require('../models/user');
const Conversation = require('../models/conversation');
const EnrollmentCode = require('../models/enrollmentCode');
const { isAdmin } = require('../middleware/auth');
const ScreenerSession = require('../models/screenerSession');
const adminImportRoutes = require('./adminImport'); // CSV import for item bank
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const multer = require('multer');
const { sendWelcomeEmail } = require('../utils/emailService');
const csv = require('csv-parser');
const { Readable } = require('stream');

// Configure multer for CSV uploads (in-memory)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'), false);
    }
  }
});

// --- Constants for Database Projections ---
// Using constants improves readability and makes queries easier to manage.
const USER_LIST_FIELDS = 'firstName lastName email username role gradeLevel teacherId mathCourse tonePreference learningStyle interests totalActiveTutoringMinutes weeklyActiveTutoringMinutes lastLogin createdAt xp level';
const TEACHER_LIST_FIELDS = 'firstName lastName _id';

// -----------------------------------------------------------------------------
// --- Item Bank Import Routes (CSV Upload) ---
// -----------------------------------------------------------------------------
// Mount adminImportRoutes here so they inherit the isAdmin middleware
router.use('/', adminImportRoutes);

// -----------------------------------------------------------------------------
// --- User & Teacher Data Routes ---
// -----------------------------------------------------------------------------

/**
 * @route   GET /api/admin/users
 * @desc    Get a list of all users with essential profile data.
 * @access  Private (Admin)
 */
router.get('/users', isAdmin, async (req, res) => {
  try {
    // .lean() provides a significant performance boost for read-only operations.
    const users = await User.find({}, USER_LIST_FIELDS).lean();
    res.json(users);
  } catch (err) {
    console.error('Error fetching users for admin:', err);
    res.status(500).json({ message: 'Server error fetching user data.' });
  }
});

/**
 * @route   GET /api/admin/students/:studentId/growth-history
 * @desc    Get a student's growth check history (admin can view any student)
 * @access  Private (Admin)
 */
router.get('/students/:studentId/growth-history', isAdmin, async (req, res) => {
  try {
    const { studentId } = req.params;
    const student = await User.findById(studentId).lean();

    if (!student) {
      return res.status(404).json({ message: 'Student not found.' });
    }

    const growthHistory = student.learningProfile?.growthCheckHistory || [];
    const currentTheta = student.learningProfile?.currentTheta || 0;

    // Calculate growth trajectory
    let totalGrowth = 0;
    let checksCompleted = growthHistory.length;
    if (checksCompleted > 0) {
      const firstTheta = growthHistory[0].previousTheta || 0;
      const latestTheta = growthHistory[checksCompleted - 1].newTheta || currentTheta;
      totalGrowth = latestTheta - firstTheta;
    }

    res.json({
      student: {
        id: student._id,
        name: `${student.firstName} ${student.lastName}`,
        username: student.username,
        email: student.email,
        gradeLevel: student.gradeLevel,
        teacherId: student.teacherId
      },
      currentTheta,
      totalGrowth: Math.round(totalGrowth * 100) / 100,
      checksCompleted,
      history: growthHistory.map(check => ({
        sessionId: check.sessionId,
        date: check.date,
        previousTheta: check.previousTheta,
        newTheta: check.newTheta,
        thetaChange: check.thetaChange,
        growthStatus: check.growthStatus,
        accuracy: check.accuracy,
        questionsAnswered: check.questionsAnswered
      }))
    });

  } catch (err) {
    console.error('Error fetching growth history for admin:', err);
    res.status(500).json({ message: 'Server error fetching growth history.' });
  }
});

/**
 * @route   GET /api/admin/teachers
 * @desc    Get a list of all users with the 'teacher' role.
 * @access  Private (Admin)
 */
router.get('/teachers', isAdmin, async (req, res) => {
  try {
    const teachers = await User.find({ role: 'teacher' }, TEACHER_LIST_FIELDS).lean();
    res.json(teachers);
  } catch (err) {
    console.error('Error fetching teachers for admin:', err);
    res.status(500).json({ message: 'Server error fetching teacher data.' });
  }
});

/**
 * @route   POST /api/admin/teachers
 * @desc    Create a new teacher account
 * @access  Private (Admin)
 */
router.post('/teachers', isAdmin, async (req, res) => {
  try {
    const { firstName, lastName, email, username, password, generatePassword } = req.body;

    // Validate required fields
    if (!firstName || !lastName || !email) {
      return res.status(400).json({ message: 'First name, last name, and email are required.' });
    }

    // Generate username if not provided
    const finalUsername = username || email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');

    // Check for existing username or email
    const existingUser = await User.findOne({
      $or: [
        { username: finalUsername.toLowerCase() },
        { email: email.toLowerCase() }
      ]
    });

    if (existingUser) {
      if (existingUser.email.toLowerCase() === email.toLowerCase()) {
        return res.status(409).json({ message: 'Email already registered.' });
      }
      if (existingUser.username === finalUsername.toLowerCase()) {
        return res.status(409).json({ message: 'Username already taken.' });
      }
    }

    // Generate or use provided password
    let finalPassword = password;
    if (generatePassword || !password) {
      // Generate a random secure password
      finalPassword = crypto.randomBytes(8).toString('hex') + 'A1!';
    }

    // Validate password strength
    const passwordRegex = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[@$!%*?&#^()_+\-=\[\]{};':"\\|,.<>\/]).{8,}$/;
    if (!passwordRegex.test(finalPassword)) {
      return res.status(400).json({
        message: 'Password must be at least 8 characters with uppercase, lowercase, number, and special character.'
      });
    }

    // Create teacher account
    const newTeacher = new User({
      firstName,
      lastName,
      email: email.toLowerCase(),
      username: finalUsername.toLowerCase(),
      passwordHash: finalPassword, // Will be hashed by pre-save hook
      role: 'teacher',
      needsProfileCompletion: false // Teachers don't need onboarding flow
    });

    await newTeacher.save();

    console.log(`[ADMIN] Teacher account created: ${email} by admin ${req.user.email}`);

    res.status(201).json({
      success: true,
      message: 'Teacher account created successfully!',
      teacher: {
        _id: newTeacher._id,
        firstName: newTeacher.firstName,
        lastName: newTeacher.lastName,
        email: newTeacher.email,
        username: newTeacher.username
      },
      // Only return password if it was auto-generated (so admin can share it)
      ...(generatePassword || !password ? { temporaryPassword: finalPassword } : {})
    });

  } catch (err) {
    console.error('Error creating teacher account:', err);
    if (err.code === 11000) {
      return res.status(409).json({ message: 'Username or email already exists.' });
    }
    res.status(500).json({ message: 'Server error creating teacher account.' });
  }
});

/**
 * @route   POST /api/admin/create-user
 * @desc    Create a new user account with any role (student, teacher, parent, admin)
 * @access  Private (Admin)
 */
router.post('/create-user', isAdmin, async (req, res) => {
  try {
    const { firstName, lastName, email, role, roles, username, password, generatePassword, sendEmail } = req.body;

    // Accept roles array or single role (backward compatible)
    const userRoles = roles && roles.length > 0 ? roles : (role ? [role] : []);

    // Validate required fields
    if (!firstName || !lastName || !email || userRoles.length === 0) {
      return res.status(400).json({ message: 'First name, last name, email, and at least one role are required.' });
    }

    // Validate all roles
    const validRoles = ['student', 'teacher', 'parent', 'admin'];
    const invalidRoles = userRoles.filter(r => !validRoles.includes(r));
    if (invalidRoles.length > 0) {
      return res.status(400).json({ message: `Invalid role(s): ${invalidRoles.join(', ')}. Must be one of: ${validRoles.join(', ')}` });
    }

    // Primary role = first role in the array
    const primaryRole = userRoles[0];

    // Generate username if not provided
    const finalUsername = username || email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');

    // Check for existing username or email
    const existingUser = await User.findOne({
      $or: [
        { username: finalUsername.toLowerCase() },
        { email: email.toLowerCase() }
      ]
    });

    if (existingUser) {
      if (existingUser.email.toLowerCase() === email.toLowerCase()) {
        return res.status(409).json({ message: 'Email already registered.' });
      }
      if (existingUser.username === finalUsername.toLowerCase()) {
        return res.status(409).json({ message: 'Username already taken.' });
      }
    }

    // Generate or use provided password
    let finalPassword = password;
    if (generatePassword || !password) {
      finalPassword = crypto.randomBytes(8).toString('hex') + 'A1!';
    }

    // Validate password strength
    const passwordRegex = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[@$!%*?&#^()_+\-=\[\]{};':"\\|,.<>\/]).{8,}$/;
    if (!passwordRegex.test(finalPassword)) {
      return res.status(400).json({
        message: 'Password must be at least 8 characters with uppercase, lowercase, number, and special character.'
      });
    }

    // Create user account
    const newUser = new User({
      firstName,
      lastName,
      email: email.toLowerCase(),
      username: finalUsername.toLowerCase(),
      passwordHash: finalPassword, // Will be hashed by pre-save hook
      role: primaryRole,
      roles: userRoles,
      needsProfileCompletion: userRoles.includes('student') && userRoles.length === 1
    });

    await newUser.save();

    const roleLabel = userRoles.length > 1
      ? userRoles.map(r => r.charAt(0).toUpperCase() + r.slice(1)).join(' + ')
      : primaryRole.charAt(0).toUpperCase() + primaryRole.slice(1);

    console.log(`[ADMIN] ${roleLabel} account created: ${email} by admin ${req.user.email}`);

    const tempPw = (generatePassword || !password) ? finalPassword : null;

    // Send welcome email if requested (fire-and-forget, don't block response)
    let emailSent = false;
    if (sendEmail) {
      try {
        const emailResult = await sendWelcomeEmail({
          email: newUser.email,
          firstName: newUser.firstName,
          lastName: newUser.lastName,
          username: newUser.username,
          roles: newUser.roles,
          temporaryPassword: tempPw
        });
        emailSent = emailResult.success;
        if (!emailSent) {
          console.warn(`[ADMIN] Welcome email failed for ${email}: ${emailResult.error}`);
        }
      } catch (emailErr) {
        console.error(`[ADMIN] Welcome email error for ${email}:`, emailErr);
      }
    }

    res.status(201).json({
      success: true,
      message: `${roleLabel} account created successfully!` + (sendEmail ? (emailSent ? ' Welcome email sent.' : ' (Welcome email failed to send)') : ''),
      user: {
        _id: newUser._id,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        email: newUser.email,
        username: newUser.username,
        role: newUser.role,
        roles: newUser.roles
      },
      temporaryPassword: tempPw,
      emailSent
    });

  } catch (err) {
    console.error('Error creating user account:', err);
    if (err.code === 11000) {
      return res.status(409).json({ message: 'Username or email already exists.' });
    }
    res.status(500).json({ message: 'Server error creating user account.' });
  }
});

/**
 * @route   POST /api/admin/link-parent-student
 * @desc    Link a parent account to a student account (bidirectional)
 * @access  Private (Admin)
 */
router.post('/link-parent-student', isAdmin, async (req, res) => {
  try {
    const { parentId, studentId } = req.body;

    if (!parentId || !studentId) {
      return res.status(400).json({ message: 'Both parent ID and student ID are required.' });
    }

    const [parent, student] = await Promise.all([
      User.findOne({ _id: parentId, role: 'parent' }),
      User.findOne({ _id: studentId, role: 'student' })
    ]);

    if (!parent) {
      return res.status(404).json({ message: 'Parent not found.' });
    }
    if (!student) {
      return res.status(404).json({ message: 'Student not found.' });
    }

    // Check if already linked
    const alreadyLinked = parent.children?.some(id => id.toString() === studentId) ||
                          student.parentIds?.some(id => id.toString() === parentId);
    if (alreadyLinked) {
      return res.status(409).json({ message: 'This parent and student are already linked.' });
    }

    // Link bidirectionally
    await Promise.all([
      User.findByIdAndUpdate(parentId, { $addToSet: { children: studentId } }),
      User.findByIdAndUpdate(studentId, { $addToSet: { parentIds: parentId } })
    ]);

    console.log(`[ADMIN] Linked parent ${parent.email} to student ${student.email} by admin ${req.user.email}`);

    res.json({
      success: true,
      message: `${parent.firstName} ${parent.lastName} is now linked to ${student.firstName} ${student.lastName}.`
    });

  } catch (err) {
    console.error('Error linking parent to student:', err);
    res.status(500).json({ message: 'Server error linking parent to student.' });
  }
});

/**
 * @route   POST /api/admin/assign-teacher
 * @desc    Assign a teacher to a student
 * @access  Private (Admin)
 */
router.post('/assign-teacher', isAdmin, async (req, res) => {
  try {
    const { teacherId, studentId } = req.body;

    if (!teacherId || !studentId) {
      return res.status(400).json({ message: 'Both teacher ID and student ID are required.' });
    }

    const [teacher, student] = await Promise.all([
      User.findOne({ _id: teacherId, role: 'teacher' }),
      User.findOne({ _id: studentId, role: 'student' })
    ]);

    if (!teacher) {
      return res.status(404).json({ message: 'Teacher not found.' });
    }
    if (!student) {
      return res.status(404).json({ message: 'Student not found.' });
    }

    if (student.teacherId?.toString() === teacherId) {
      return res.status(409).json({ message: 'This student is already assigned to this teacher.' });
    }

    await User.findByIdAndUpdate(studentId, { teacherId });

    console.log(`[ADMIN] Assigned teacher ${teacher.email} to student ${student.email} by admin ${req.user.email}`);

    res.json({
      success: true,
      message: `${student.firstName} ${student.lastName} is now assigned to ${teacher.firstName} ${teacher.lastName}.`
    });

  } catch (err) {
    console.error('Error assigning teacher to student:', err);
    res.status(500).json({ message: 'Server error assigning teacher.' });
  }
});

// -----------------------------------------------------------------------------
// --- Enrollment Code Routes ---
// -----------------------------------------------------------------------------

/**
 * @route   GET /api/admin/enrollment-codes
 * @desc    Get all enrollment codes (optionally filtered by teacher)
 * @access  Private (Admin)
 */
router.get('/enrollment-codes', isAdmin, async (req, res) => {
  try {
    const { teacherId } = req.query;
    const filter = teacherId ? { teacherId } : {};

    const codes = await EnrollmentCode.find(filter)
      .populate('teacherId', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .lean();

    res.json(codes);
  } catch (err) {
    console.error('Error fetching enrollment codes:', err);
    res.status(500).json({ message: 'Server error fetching enrollment codes.' });
  }
});

/**
 * @route   POST /api/admin/enrollment-codes
 * @desc    Create a new enrollment code for a teacher
 * @access  Private (Admin)
 */
router.post('/enrollment-codes', isAdmin, async (req, res) => {
  try {
    const { teacherId, className, description, gradeLevel, mathCourse, customCode, expiresAt, maxUses } = req.body;

    // Validate teacher exists
    if (!teacherId) {
      return res.status(400).json({ message: 'Teacher ID is required.' });
    }

    const teacher = await User.findOne({ _id: teacherId, role: 'teacher' });
    if (!teacher) {
      return res.status(404).json({ message: 'Teacher not found.' });
    }

    // Generate or use custom code
    let code;
    if (customCode) {
      // Check if custom code already exists
      const existingCode = await EnrollmentCode.findOne({ code: customCode.toUpperCase() });
      if (existingCode) {
        return res.status(409).json({ message: 'This enrollment code already exists.' });
      }
      code = customCode.toUpperCase();
    } else {
      // Generate unique code with teacher's name prefix
      const prefix = `${teacher.lastName.substring(0, 4).toUpperCase()}`;
      code = await EnrollmentCode.generateUniqueCode(prefix);
    }

    // Create enrollment code
    const newCode = new EnrollmentCode({
      code,
      teacherId,
      className: className || 'My Class',
      description,
      gradeLevel,
      mathCourse,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      maxUses: maxUses || null,
      createdBy: req.user._id
    });

    await newCode.save();

    console.log(`[ADMIN] Enrollment code created: ${code} for teacher ${teacher.email}`);

    res.status(201).json({
      success: true,
      message: 'Enrollment code created successfully!',
      enrollmentCode: {
        _id: newCode._id,
        code: newCode.code,
        className: newCode.className,
        teacherId: newCode.teacherId,
        teacherName: `${teacher.firstName} ${teacher.lastName}`,
        gradeLevel: newCode.gradeLevel,
        mathCourse: newCode.mathCourse,
        expiresAt: newCode.expiresAt,
        maxUses: newCode.maxUses,
        useCount: newCode.useCount
      }
    });

  } catch (err) {
    console.error('Error creating enrollment code:', err);
    res.status(500).json({ message: 'Server error creating enrollment code.' });
  }
});

/**
 * @route   PATCH /api/admin/enrollment-codes/:codeId
 * @desc    Update an enrollment code (activate/deactivate, change settings)
 * @access  Private (Admin)
 */
router.patch('/enrollment-codes/:codeId', isAdmin, async (req, res) => {
  try {
    const { codeId } = req.params;
    const { isActive, className, description, expiresAt, maxUses } = req.body;

    const code = await EnrollmentCode.findById(codeId);
    if (!code) {
      return res.status(404).json({ message: 'Enrollment code not found.' });
    }

    // Update fields
    if (typeof isActive === 'boolean') code.isActive = isActive;
    if (className) code.className = className;
    if (description !== undefined) code.description = description;
    if (expiresAt !== undefined) code.expiresAt = expiresAt ? new Date(expiresAt) : null;
    if (maxUses !== undefined) code.maxUses = maxUses;

    await code.save();

    res.json({
      success: true,
      message: 'Enrollment code updated successfully!',
      enrollmentCode: code
    });

  } catch (err) {
    console.error('Error updating enrollment code:', err);
    res.status(500).json({ message: 'Server error updating enrollment code.' });
  }
});

/**
 * @route   DELETE /api/admin/enrollment-codes/:codeId
 * @desc    Delete an enrollment code
 * @access  Private (Admin)
 */
router.delete('/enrollment-codes/:codeId', isAdmin, async (req, res) => {
  try {
    const { codeId } = req.params;

    const code = await EnrollmentCode.findByIdAndDelete(codeId);
    if (!code) {
      return res.status(404).json({ message: 'Enrollment code not found.' });
    }

    console.log(`[ADMIN] Enrollment code deleted: ${code.code}`);

    res.json({
      success: true,
      message: 'Enrollment code deleted successfully!'
    });

  } catch (err) {
    console.error('Error deleting enrollment code:', err);
    res.status(500).json({ message: 'Server error deleting enrollment code.' });
  }
});

/**
 * @route   POST /api/admin/enrollment-codes/:codeId/students
 * @desc    Add existing students to a class (enrollment code)
 * @body    { studentIds: [array of student IDs] }
 * @access  Private (Admin)
 */
router.post('/enrollment-codes/:codeId/students', isAdmin, async (req, res) => {
  try {
    const { codeId } = req.params;
    const { studentIds } = req.body;

    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ message: 'studentIds array is required.' });
    }

    const code = await EnrollmentCode.findById(codeId);
    if (!code) {
      return res.status(404).json({ message: 'Enrollment code not found.' });
    }

    // Verify all students exist and are actually students
    const students = await User.find({
      _id: { $in: studentIds },
      role: 'student'
    });

    if (students.length === 0) {
      return res.status(400).json({ message: 'No valid students found.' });
    }

    // Add students to the enrollment code
    let addedCount = 0;
    let alreadyEnrolledCount = 0;

    for (const student of students) {
      const alreadyEnrolled = code.enrolledStudents.some(
        e => e.studentId.toString() === student._id.toString()
      );

      if (!alreadyEnrolled) {
        code.enrolledStudents.push({
          studentId: student._id,
          enrolledAt: new Date(),
          enrollmentMethod: 'admin-added'
        });

        // Also assign the teacher if the student doesn't have one
        if (!student.teacherId && code.teacherId) {
          student.teacherId = code.teacherId;
          await student.save();
        }

        addedCount++;
      } else {
        alreadyEnrolledCount++;
      }
    }

    await code.save();

    console.log(`[ADMIN] Added ${addedCount} students to class ${code.code}`);

    res.json({
      success: true,
      message: `Added ${addedCount} student(s) to class. ${alreadyEnrolledCount > 0 ? `${alreadyEnrolledCount} were already enrolled.` : ''}`,
      addedCount,
      alreadyEnrolledCount,
      totalEnrolled: code.enrolledStudents.length
    });

  } catch (err) {
    console.error('Error adding students to class:', err);
    res.status(500).json({ message: 'Server error adding students to class.' });
  }
});

/**
 * @route   DELETE /api/admin/enrollment-codes/:codeId/students/:studentId
 * @desc    Remove a student from a class (enrollment code)
 * @access  Private (Admin)
 */
router.delete('/enrollment-codes/:codeId/students/:studentId', isAdmin, async (req, res) => {
  try {
    const { codeId, studentId } = req.params;

    const code = await EnrollmentCode.findById(codeId);
    if (!code) {
      return res.status(404).json({ message: 'Enrollment code not found.' });
    }

    const initialCount = code.enrolledStudents.length;
    code.enrolledStudents = code.enrolledStudents.filter(
      e => e.studentId.toString() !== studentId
    );

    if (code.enrolledStudents.length === initialCount) {
      return res.status(404).json({ message: 'Student not found in this class.' });
    }

    await code.save();

    console.log(`[ADMIN] Removed student ${studentId} from class ${code.code}`);

    res.json({
      success: true,
      message: 'Student removed from class.',
      totalEnrolled: code.enrolledStudents.length
    });

  } catch (err) {
    console.error('Error removing student from class:', err);
    res.status(500).json({ message: 'Server error removing student from class.' });
  }
});

/**
 * @route   GET /api/admin/enrollment-codes/:codeId/students
 * @desc    Get all students in a class (enrollment code)
 * @access  Private (Admin)
 */
router.get('/enrollment-codes/:codeId/students', isAdmin, async (req, res) => {
  try {
    const { codeId } = req.params;

    const code = await EnrollmentCode.findById(codeId)
      .populate('enrolledStudents.studentId', 'firstName lastName email username gradeLevel');

    if (!code) {
      return res.status(404).json({ message: 'Enrollment code not found.' });
    }

    const students = code.enrolledStudents.map(e => ({
      _id: e.studentId._id,
      firstName: e.studentId.firstName,
      lastName: e.studentId.lastName,
      email: e.studentId.email,
      username: e.studentId.username,
      gradeLevel: e.studentId.gradeLevel,
      enrolledAt: e.enrolledAt,
      enrollmentMethod: e.enrollmentMethod
    }));

    res.json({
      success: true,
      className: code.className,
      code: code.code,
      students,
      totalEnrolled: students.length
    });

  } catch (err) {
    console.error('Error fetching class students:', err);
    res.status(500).json({ message: 'Server error fetching class students.' });
  }
});

// -----------------------------------------------------------------------------
// --- Roster Import Routes ---
// -----------------------------------------------------------------------------

/**
 * @route   POST /api/admin/roster-import
 * @desc    Bulk import students from a CSV file
 * @body    CSV file with columns: firstName, lastName, email, username (optional), gradeLevel (optional), mathCourse (optional)
 * @query   teacherId - Teacher to assign students to
 * @query   enrollmentCodeId - Enrollment code to use (optional)
 * @query   dryRun - If true, only validate without creating accounts
 * @access  Private (Admin)
 */
router.post('/roster-import', isAdmin, upload.single('file'), async (req, res) => {
  try {
    const { teacherId, enrollmentCodeId, dryRun } = req.query;

    if (!req.file) {
      return res.status(400).json({ message: 'CSV file is required.' });
    }

    // Validate teacher if provided
    let teacher = null;
    if (teacherId) {
      teacher = await User.findOne({ _id: teacherId, role: 'teacher' });
      if (!teacher) {
        return res.status(404).json({ message: 'Teacher not found.' });
      }
    }

    // Get enrollment code if provided
    let enrollmentCode = null;
    if (enrollmentCodeId) {
      enrollmentCode = await EnrollmentCode.findById(enrollmentCodeId);
      if (!enrollmentCode) {
        return res.status(404).json({ message: 'Enrollment code not found.' });
      }
      // Use teacher from enrollment code if not explicitly provided
      if (!teacher) {
        teacher = await User.findById(enrollmentCode.teacherId);
      }
    }

    // Parse CSV
    const students = [];
    const errors = [];
    let rowNumber = 1;

    const parseCSV = () => {
      return new Promise((resolve, reject) => {
        const stream = Readable.from(req.file.buffer.toString());

        stream
          .pipe(csv({
            mapHeaders: ({ header }) => header.trim().toLowerCase().replace(/\s+/g, '')
          }))
          .on('data', (row) => {
            rowNumber++;

            // Normalize column names (handle variations)
            const firstName = row.firstname || row.first_name || row['first name'] || '';
            const lastName = row.lastname || row.last_name || row['last name'] || '';
            const email = row.email || row.emailaddress || row['email address'] || '';
            const username = row.username || row.user_name || '';
            const gradeLevel = row.gradelevel || row.grade_level || row.grade || enrollmentCode?.gradeLevel || '';
            const mathCourse = row.mathcourse || row.math_course || row.course || enrollmentCode?.mathCourse || '';

            // Validate required fields
            if (!firstName.trim()) {
              errors.push({ row: rowNumber, field: 'firstName', message: 'First name is required' });
              return;
            }
            if (!lastName.trim()) {
              errors.push({ row: rowNumber, field: 'lastName', message: 'Last name is required' });
              return;
            }
            if (!email.trim()) {
              errors.push({ row: rowNumber, field: 'email', message: 'Email is required' });
              return;
            }

            // Basic email validation
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email.trim())) {
              errors.push({ row: rowNumber, field: 'email', message: `Invalid email format: ${email}` });
              return;
            }

            students.push({
              firstName: firstName.trim(),
              lastName: lastName.trim(),
              email: email.trim().toLowerCase(),
              username: username.trim().toLowerCase() || email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, ''),
              gradeLevel: gradeLevel.trim(),
              mathCourse: mathCourse.trim(),
              rowNumber
            });
          })
          .on('end', () => resolve())
          .on('error', (err) => reject(err));
      });
    };

    await parseCSV();

    // Check for duplicates in CSV
    const emailsSeen = new Set();
    const usernamesSeen = new Set();
    const duplicateStudents = [];

    for (const student of students) {
      if (emailsSeen.has(student.email)) {
        errors.push({ row: student.rowNumber, field: 'email', message: `Duplicate email in CSV: ${student.email}` });
        duplicateStudents.push(student.email);
      }
      if (usernamesSeen.has(student.username)) {
        errors.push({ row: student.rowNumber, field: 'username', message: `Duplicate username in CSV: ${student.username}` });
      }
      emailsSeen.add(student.email);
      usernamesSeen.add(student.username);
    }

    // Filter out duplicates for further processing
    const validStudents = students.filter(s => !duplicateStudents.includes(s.email));

    // Check for existing users in database
    const existingEmails = await User.find({
      email: { $in: validStudents.map(s => s.email) }
    }).select('email').lean();

    const existingUsernames = await User.find({
      username: { $in: validStudents.map(s => s.username) }
    }).select('username').lean();

    const existingEmailSet = new Set(existingEmails.map(u => u.email));
    const existingUsernameSet = new Set(existingUsernames.map(u => u.username));

    const newStudents = [];
    const skippedStudents = [];

    for (const student of validStudents) {
      if (existingEmailSet.has(student.email)) {
        skippedStudents.push({
          ...student,
          reason: 'Email already registered'
        });
      } else if (existingUsernameSet.has(student.username)) {
        // Try to generate a unique username
        let uniqueUsername = student.username;
        let counter = 1;
        while (existingUsernameSet.has(uniqueUsername)) {
          uniqueUsername = `${student.username}${counter}`;
          counter++;
        }
        student.username = uniqueUsername;
        newStudents.push(student);
      } else {
        newStudents.push(student);
      }
    }

    // If dry run, return validation results
    if (dryRun === 'true') {
      return res.json({
        success: true,
        dryRun: true,
        summary: {
          totalRows: rowNumber - 1,
          validStudents: newStudents.length,
          skippedStudents: skippedStudents.length,
          errors: errors.length
        },
        newStudents: newStudents.map(s => ({
          firstName: s.firstName,
          lastName: s.lastName,
          email: s.email,
          username: s.username,
          gradeLevel: s.gradeLevel,
          mathCourse: s.mathCourse
        })),
        skippedStudents,
        errors
      });
    }

    // Create student accounts
    const createdStudents = [];
    const creationErrors = [];

    for (const student of newStudents) {
      try {
        // Generate a random password for each student
        const temporaryPassword = crypto.randomBytes(6).toString('hex') + 'A1!';

        const newUser = new User({
          firstName: student.firstName,
          lastName: student.lastName,
          email: student.email,
          username: student.username,
          passwordHash: temporaryPassword,
          role: 'student',
          gradeLevel: student.gradeLevel,
          mathCourse: student.mathCourse,
          teacherId: teacher?._id,
          needsProfileCompletion: true
        });

        await newUser.save();

        // If enrollment code provided, record the enrollment
        if (enrollmentCode) {
          await enrollmentCode.enrollStudent(newUser._id, 'csv-import');
        }

        createdStudents.push({
          _id: newUser._id,
          firstName: newUser.firstName,
          lastName: newUser.lastName,
          email: newUser.email,
          username: newUser.username,
          temporaryPassword
        });

      } catch (err) {
        creationErrors.push({
          student: `${student.firstName} ${student.lastName} (${student.email})`,
          error: err.message
        });
      }
    }

    console.log(`[ADMIN] Roster import: ${createdStudents.length} students created by ${req.user.email}`);

    res.json({
      success: true,
      message: `Successfully created ${createdStudents.length} student account(s).`,
      summary: {
        totalRows: rowNumber - 1,
        created: createdStudents.length,
        skipped: skippedStudents.length,
        errors: errors.length + creationErrors.length
      },
      createdStudents,
      skippedStudents,
      errors: [...errors, ...creationErrors]
    });

  } catch (err) {
    console.error('Error during roster import:', err);
    res.status(500).json({ message: 'Server error during roster import.' });
  }
});

// -----------------------------------------------------------------------------
// --- Student-Specific Routes ---
// -----------------------------------------------------------------------------

/**
 * @route   GET /api/admin/students/:studentId/profile
 * @desc    Get a specific student's full profile for the modal view.
 * @access  Private (Admin)
 */
// NOTE: This endpoint is implicitly handled by the main GET /users route,
// as the frontend filters the main list. If a direct fetch is needed in the future,
// it can be implemented here using the USER_LIST_FIELDS projection.

/**
 * @route   PATCH /api/admin/students/:studentId/profile
 * @desc    Update a student's general profile information.
 * @access  Private (Admin)
 */
router.patch('/students/:studentId/profile', isAdmin, async (req, res) => {
  try {
    const { studentId } = req.params;
    const updates = req.body;
    
    // Whitelist of fields that are safe to update via this endpoint.
    const allowedUpdates = [
      'firstName', 'lastName', 'email', 'gradeLevel', 'mathCourse',
      'tonePreference', 'learningStyle', 'interests'
    ];
    
    const validUpdates = {};
    for (const key of allowedUpdates) {
      if (updates[key] !== undefined) {
        validUpdates[key] = updates[key];
      }
    }

    if (Object.keys(validUpdates).length === 0) {
      return res.status(400).json({ message: 'No valid fields provided for update.' });
    }

    // If name fields are updated, also update the composite 'name' field for consistency.
    if (validUpdates.firstName || validUpdates.lastName) {
      const currentUser = await User.findById(studentId, 'firstName lastName').lean();
      if(currentUser) {
          const newFirstName = validUpdates.firstName || currentUser.firstName;
          const newLastName = validUpdates.lastName || currentUser.lastName;
          validUpdates.name = `${newFirstName} ${newLastName}`;
      }
    }

    const result = await User.findOneAndUpdate(
      { _id: studentId, role: 'student' },
      { $set: validUpdates },
      { new: true, runValidators: true }
    );

    if (!result) {
      return res.status(404).json({ message: 'Student not found.' });
    }
    res.json({ message: 'Student profile updated successfully!' });
  } catch (err) {
    console.error('Error updating student profile for admin:', err);
    res.status(500).json({ message: 'Server error updating student profile.' });
  }
});


/**
 * @route   GET /api/admin/students/:studentId/iep
 * @desc    Get a student's IEP plan.
 * @access  Private (Admin)
 */
router.get('/students/:studentId/iep', isAdmin, async (req, res) => {
  try {
    const student = await User.findById(req.params.studentId, 'iepPlan').lean();
    if (!student) {
      return res.status(404).json({ message: 'Student not found.' });
    }
    res.json(student.iepPlan || {}); // Return empty object if no plan exists
  } catch (err) {
    console.error('Error fetching student IEP for admin:', err);
    res.status(500).json({ message: 'Server error fetching IEP data.' });
  }
});

/**
 * @route   PUT /api/admin/students/:studentId/iep
 * @desc    Update/replace a student's entire IEP plan.
 * @access  Private (Admin)
 */
router.put('/students/:studentId/iep', isAdmin, async (req, res) => {
  try {
    // SECURITY HARDENING: Explicitly build the IEP object from the request body
    // to prevent malicious or accidental field injection.
    const { accommodations, readingLevel, preferredScaffolds, goals } = req.body;
    const sanitizedIepPlan = {
        accommodations: accommodations || {},
        readingLevel: readingLevel,
        preferredScaffolds: preferredScaffolds || [],
        goals: goals || []
    };

    const result = await User.findOneAndUpdate(
      { _id: req.params.studentId, role: 'student' },
      { $set: { iepPlan: sanitizedIepPlan } },
      { new: true, runValidators: true, lean: true }
    );
    if (!result) {
      return res.status(404).json({ message: 'Student not found.' });
    }
    res.json({ message: 'IEP plan updated successfully!', iepPlan: result.iepPlan });
  } catch (err) {
    console.error('Error updating student IEP for admin:', err);
    res.status(500).json({ message: 'Server error updating IEP data.' });
  }
});

/**
 * @route   GET /api/admin/students/:studentId/conversations
 * @desc    Get a student's conversation history.
 * @access  Private (Admin)
 */
router.get('/students/:studentId/conversations', isAdmin, async (req, res) => {
  try {
    const conversations = await Conversation.find({ userId: req.params.studentId })
        .sort({ startDate: -1 })
        .select('summary activeMinutes startDate') // Fixed: removed non-existent 'date' field
        .lean();
    
    // Returning an empty array is a successful response, not an error.
    res.json(conversations);
  } catch (err) {
    console.error('Error fetching student conversations for admin:', err);
    res.status(500).json({ message: 'Server error fetching conversation data.' });
  }
});

// -----------------------------------------------------------------------------
// --- Bulk & System Routes ---
// -----------------------------------------------------------------------------

/**
 * @route   PATCH /api/admin/assign-teacher
 * @desc    Assign or unassign multiple students to a single teacher.
 * @access  Private (Admin)
 */
router.patch('/assign-teacher', isAdmin, async (req, res) => {
  try {
    const { studentIds, teacherId } = req.body;
    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ message: 'An array of student IDs is required.' });
    }
    
    if (teacherId) {
      const teacher = await User.findOne({ _id: teacherId, role: 'teacher' });
      if (!teacher) {
        return res.status(404).json({ message: 'Teacher not found.' });
      }
    }
    
    const updateResult = await User.updateMany(
      { _id: { $in: studentIds }, role: 'student' },
      { $set: { teacherId: teacherId || null } }
    );

    if (updateResult.matchedCount === 0) {
      return res.status(404).json({ message: 'No matching students found to update.' });
    }

    const assignmentStatus = teacherId ? `assigned to teacher` : 'unassigned';
    res.json({ message: `${updateResult.modifiedCount} student(s) have been ${assignmentStatus}.` });
  } catch (err) {
    console.error('Error during batch teacher assignment:', err);
    res.status(500).json({ message: 'Server error during teacher assignment.' });
  }
});

/**
 * @route   GET /api/admin/health-check
 * @desc    A simple endpoint to confirm the API is running.
 * @access  Private (Admin)
 */
router.get('/health-check', isAdmin, (req, res) => {
  res.status(200).json({
    status: 'Operational',
    timestamp: new Date().toISOString()
  });
});

/**
 * @route   POST /api/admin/seed-skills
 * @desc    Seed the skills database with Ready for Algebra 1 skills.
 * @access  Private (Admin)
 */
router.post('/seed-skills', isAdmin, async (req, res) => {
  try {
    const Skill = require('../models/skill');
    const fs = require('fs');
    const path = require('path');

    // Read skills JSON
    const skillsPath = path.join(__dirname, '../seeds/skills-ready-for-algebra.json');
    const skillsData = JSON.parse(fs.readFileSync(skillsPath, 'utf8'));

    // Check for existing skills
    const existingCount = await Skill.countDocuments();

    // Clear existing skills if requested
    if (req.body.clearExisting && existingCount > 0) {
      await Skill.deleteMany({});
    }

    // Insert or update skills
    const results = {
      inserted: 0,
      updated: 0,
      unchanged: 0
    };

    for (const skillData of skillsData) {
      const existing = await Skill.findOne({ skillId: skillData.skillId });

      if (!existing) {
        await Skill.create(skillData);
        results.inserted++;
      } else if (req.body.updateExisting) {
        await Skill.findOneAndUpdate(
          { skillId: skillData.skillId },
          skillData,
          { new: true }
        );
        results.updated++;
      } else {
        results.unchanged++;
      }
    }

    // Get summary by category
    const categories = await Skill.aggregate([
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    res.json({
      message: 'Skills seeding completed',
      results,
      totalSkills: await Skill.countDocuments(),
      categories: categories.map(c => ({ category: c._id, count: c.count }))
    });

  } catch (err) {
    console.error('Error seeding skills:', err);
    res.status(500).json({
      message: 'Error seeding skills database',
      error: err.message
    });
  }
});

// -----------------------------------------------------------------------------
// --- Reports ---
// -----------------------------------------------------------------------------

/**
 * @route   GET /api/admin/reports/usage
 * @desc    Get comprehensive usage report showing who's logging in and for how long
 * @query   startDate - Optional start date filter (ISO string)
 * @query   endDate - Optional end date filter (ISO string)
 * @query   role - Optional role filter (student, teacher, parent, admin)
 * @query   sortBy - Optional sort field (lastLogin, totalMinutes, weeklyMinutes, name)
 * @query   sortOrder - Optional sort direction (asc, desc)
 * @access  Private (Admin)
 */
router.get('/reports/usage', isAdmin, async (req, res) => {
  try {
    const { startDate, endDate, role, sortBy = 'lastLogin', sortOrder = 'desc' } = req.query;

    // Build query filter
    const filter = {};
    if (role) {
      filter.role = role;
    }

    if (startDate || endDate) {
      filter.lastLogin = {};
      if (startDate) {
        filter.lastLogin.$gte = new Date(startDate);
      }
      if (endDate) {
        filter.lastLogin.$lte = new Date(endDate);
      }
    }

    // Determine sort field
    const sortField = {
      'lastLogin': { lastLogin: sortOrder === 'asc' ? 1 : -1 },
      'totalMinutes': { totalActiveTutoringMinutes: sortOrder === 'asc' ? 1 : -1 },
      'weeklyMinutes': { weeklyActiveTutoringMinutes: sortOrder === 'asc' ? 1 : -1 },
      'name': { firstName: sortOrder === 'asc' ? 1 : -1, lastName: sortOrder === 'asc' ? 1 : -1 }
    }[sortBy] || { lastLogin: -1 };

    // Fetch all users with activity data
    const users = await User.find(filter)
      .select('firstName lastName username email role lastLogin totalActiveTutoringMinutes weeklyActiveTutoringMinutes createdAt xp level teacherId')
      .populate('teacherId', 'firstName lastName')
      .sort(sortField)
      .lean();

    // Get conversation counts for each user
    const userIds = users.map(u => u._id);
    const conversationStats = await Conversation.aggregate([
      {
        $match: {
          userId: { $in: userIds },
          ...(startDate || endDate ? {
            lastActivity: {
              ...(startDate ? { $gte: new Date(startDate) } : {}),
              ...(endDate ? { $lte: new Date(endDate) } : {})
            }
          } : {})
        }
      },
      {
        $group: {
          _id: '$userId',
          sessionCount: { $sum: 1 },
          totalMessages: { $sum: { $size: '$messages' } }
        }
      }
    ]);

    // Create lookup map for conversation stats
    const statsMap = {};
    conversationStats.forEach(stat => {
      statsMap[stat._id.toString()] = {
        sessionCount: stat.sessionCount,
        totalMessages: stat.totalMessages
      };
    });

    // Calculate summary statistics
    const now = new Date();
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

    const activeToday = users.filter(u => u.lastLogin && new Date(u.lastLogin) > oneDayAgo).length;
    const activeThisWeek = users.filter(u => u.lastLogin && new Date(u.lastLogin) > oneWeekAgo).length;
    const totalMinutesThisWeek = users.reduce((sum, u) => sum + (u.weeklyActiveTutoringMinutes || 0), 0);
    const totalMinutesAllTime = users.reduce((sum, u) => sum + (u.totalActiveTutoringMinutes || 0), 0);

    // Enrich user data with conversation stats
    const enrichedUsers = users.map(user => {
      const stats = statsMap[user._id.toString()] || { sessionCount: 0, totalMessages: 0 };
      return {
        userId: user._id,
        name: `${user.firstName} ${user.lastName}`,
        username: user.username,
        email: user.email,
        role: user.role,
        lastLogin: user.lastLogin,
        totalMinutes: user.totalActiveTutoringMinutes || 0,
        weeklyMinutes: user.weeklyActiveTutoringMinutes || 0,
        level: user.level || 1,
        xp: user.xp || 0,
        sessionCount: stats.sessionCount,
        totalMessages: stats.totalMessages,
        teacher: user.teacherId ? `${user.teacherId.firstName} ${user.teacherId.lastName}` : null,
        createdAt: user.createdAt,
        daysSinceLastLogin: user.lastLogin ? Math.floor((now - new Date(user.lastLogin)) / (1000 * 60 * 60 * 24)) : null
      };
    });

    res.json({
      summary: {
        totalUsers: users.length,
        activeToday: activeToday,
        activeThisWeek: activeThisWeek,
        totalMinutesThisWeek: totalMinutesThisWeek,
        totalMinutesAllTime: totalMinutesAllTime,
        averageMinutesPerUser: users.length > 0 ? Math.round(totalMinutesAllTime / users.length) : 0
      },
      filters: {
        startDate: startDate || null,
        endDate: endDate || null,
        role: role || 'all',
        sortBy: sortBy,
        sortOrder: sortOrder
      },
      users: enrichedUsers
    });

  } catch (err) {
    console.error('Error generating usage report:', err);
    res.status(500).json({ message: 'Server error generating usage report.' });
  }
});

/**
 * @route   GET /api/admin/reports/live-activity
 * @desc    Get live activity feed showing currently active students
 * @access  Private (Admin)
 */
router.get('/reports/live-activity', isAdmin, async (req, res) => {
  try {
    // Find conversations that were active in the last 10 minutes
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

    const activeConversations = await Conversation.find({
      isActive: true,
      lastActivity: { $gte: tenMinutesAgo }
    })
      .populate('userId', 'firstName lastName level xp teacherId')
      .sort({ lastActivity: -1 })
      .limit(50)
      .lean();

    const liveActivity = activeConversations.map(conv => ({
      conversationId: conv._id,
      studentId: conv.userId?._id,
      studentName: conv.userId ? `${conv.userId.firstName} ${conv.userId.lastName}` : 'Unknown',
      level: conv.userId?.level || 1,
      xp: conv.userId?.xp || 0,
      currentTopic: conv.currentTopic || 'mathematics',
      problemsAttempted: conv.problemsAttempted || 0,
      problemsCorrect: conv.problemsCorrect || 0,
      strugglingWith: conv.strugglingWith || null,
      activeMinutes: conv.activeMinutes || 0,
      lastActivity: conv.lastActivity,
      alerts: conv.alerts?.filter(a => !a.acknowledged) || [],
      minutesAgo: Math.floor((Date.now() - new Date(conv.lastActivity).getTime()) / (1000 * 60))
    }));

    res.json({
      timestamp: new Date().toISOString(),
      activeSessionCount: liveActivity.length,
      sessions: liveActivity
    });

  } catch (err) {
    console.error('Error fetching live activity:', err);
    res.status(500).json({ message: 'Server error fetching live activity.' });
  }
});

/**
 * @route   GET /api/admin/reports/summaries
 * @desc    Get all users with their recent conversation summaries
 * @access  Private (Admin)
 */
router.get('/reports/summaries', isAdmin, async (req, res) => {
  try {
    // Get all users (excluding admins for cleaner view)
    const users = await User.find({ role: { $ne: 'admin' } })
      .select('firstName lastName email role username totalActiveTutoringMinutes weeklyActiveTutoringMinutes level xp lastLogin createdAt teacherId')
      .populate('teacherId', 'firstName lastName')
      .sort({ lastName: 1, firstName: 1 })
      .lean();

    // Get recent conversations for all users (limit to 3 most recent per user)
    const userIds = users.map(u => u._id);

    const conversations = await Conversation.aggregate([
      {
        $match: { userId: { $in: userIds } }
      },
      {
        $sort: { startDate: -1 }
      },
      {
        $group: {
          _id: '$userId',
          conversations: {
            $push: {
              summary: '$summary',
              startDate: '$startDate',
              activeMinutes: '$activeMinutes'
            }
          }
        }
      },
      {
        $project: {
          _id: 1,
          conversations: { $slice: ['$conversations', 3] }
        }
      }
    ]);

    // Create lookup map for conversations
    const conversationsMap = {};
    conversations.forEach(conv => {
      conversationsMap[conv._id.toString()] = conv.conversations;
    });

    // Enrich users with their recent conversations
    const enrichedUsers = users.map(user => ({
      userId: user._id,
      name: `${user.firstName} ${user.lastName}`,
      email: user.email,
      username: user.username,
      role: user.role,
      level: user.level || 1,
      xp: user.xp || 0,
      totalMinutes: user.totalActiveTutoringMinutes || 0,
      weeklyMinutes: user.weeklyActiveTutoringMinutes || 0,
      lastLogin: user.lastLogin,
      createdAt: user.createdAt,
      teacher: user.teacherId ? `${user.teacherId.firstName} ${user.teacherId.lastName}` : null,
      recentConversations: conversationsMap[user._id.toString()] || []
    }));

    res.json({
      users: enrichedUsers,
      totalUsers: enrichedUsers.length,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error('Error fetching user summaries:', err);
    res.status(500).json({ message: 'Server error fetching user summaries.' });
  }
});

/**
 * @route   POST /api/admin/students/:studentId/reset-assessment
 * @desc    Reset a student's placement assessment (admin only)
 * @access  Private (Admin)
 *
 * Allows admin to reset any student's screener so they can retake it.
 * Use cases: After summer break, significant skill regression, incorrect placement
 */
router.post('/students/:studentId/reset-assessment', isAdmin, async (req, res) => {
  try {
    const { studentId } = req.params;
    const adminId = req.user._id;
    const { reason } = req.body; // Optional reason for audit trail

    // Find the student
    const student = await User.findOne({ _id: studentId, role: 'student' });
    if (!student) {
      return res.status(404).json({ message: 'Student not found.' });
    }

    // Store previous assessment data for audit trail
    const previousAssessment = {
      completedDate: student.assessmentDate,
      placement: student.initialPlacement,
      resetDate: new Date(),
      resetBy: adminId,
      resetByRole: 'admin',
      reason: reason || 'Admin requested reset'
    };

    // Add to assessment history if it doesn't exist
    if (!student.learningProfile.assessmentHistory) {
      student.learningProfile.assessmentHistory = [];
    }
    student.learningProfile.assessmentHistory.push(previousAssessment);

    // Reset assessment flags
    student.assessmentCompleted = false;
    student.assessmentDate = null;
    student.initialPlacement = null;

    // Optional: Clear skill mastery (keeping it for now to preserve learning history)
    // student.skillMastery = new Map();

    await student.save();

    console.log(`[Admin] Assessment reset for student ${studentId} by admin ${adminId}`);

    res.json({
      success: true,
      message: `Assessment reset successfully for ${student.firstName} ${student.lastName}`,
      studentName: `${student.firstName} ${student.lastName}`,
      previousAssessment
    });

  } catch (error) {
    console.error('Error resetting student assessment:', error);
    res.status(500).json({ message: 'Error resetting assessment' });
  }
});

/**
 * @route   DELETE /api/admin/users/:userId
 * @desc    Delete a user account (admin only)
 * @access  Private (Admin)
 */
router.delete('/users/:userId', isAdmin, async (req, res) => {
  try {
    const { userId } = req.params;

    // Prevent admin from deleting themselves
    if (userId === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'You cannot delete your own account.'
      });
    }

    // Find the user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.'
      });
    }

    // Store user info for logging
    const userInfo = `${user.firstName} ${user.lastName} (${user.email}, ${user.role})`;

    // Delete associated data
    await Promise.all([
      // Delete all conversations
      Conversation.deleteMany({ userId: user._id }),
      // If teacher, remove from students' teacherId
      user.role === 'teacher' ? User.updateMany(
        { teacherId: user._id },
        { $unset: { teacherId: '' } }
      ) : Promise.resolve(),
      // If parent, unlink from children
      user.role === 'parent' && user.children?.length > 0 ? User.updateMany(
        { _id: { $in: user.children } },
        { $unset: { parentId: '' } }
      ) : Promise.resolve(),
      // Delete the user
      User.findByIdAndDelete(userId)
    ]);

    console.log(`[ADMIN] User deleted by ${req.user.email}: ${userInfo}`);

    res.json({
      success: true,
      message: `User "${userInfo}" has been deleted successfully.`
    });

  } catch (err) {
    console.error('Error deleting user:', err);
    res.status(500).json({
      success: false,
      message: 'Server error deleting user.'
    });
  }
});

// -----------------------------------------------------------------------------
// --- Alpha Testing: Survey Responses ---
// -----------------------------------------------------------------------------

/**
 * @route   GET /api/admin/survey-responses
 * @desc    Get all survey responses from all users for alpha testing analysis
 * @access  Private (Admin)
 */
router.get('/survey-responses', isAdmin, async (req, res) => {
  try {
    const { limit = 100, skip = 0, sortBy = 'submittedAt', order = 'desc' } = req.query;

    // Fetch all users who have submitted survey responses
    const users = await User.find(
      { 'sessionSurveys.responses.0': { $exists: true } },
      'firstName lastName email username role sessionSurveys.responses sessionSurveys.responsesCount'
    ).lean();

    // Flatten all responses with user info
    const allResponses = [];
    for (const user of users) {
      if (user.sessionSurveys && user.sessionSurveys.responses) {
        for (const response of user.sessionSurveys.responses) {
          allResponses.push({
            ...response,
            userId: user._id,
            userEmail: user.email,
            userName: `${user.firstName} ${user.lastName}`,
            userRole: user.role
          });
        }
      }
    }

    // Sort responses
    allResponses.sort((a, b) => {
      const aVal = a[sortBy] || a.submittedAt;
      const bVal = b[sortBy] || b.submittedAt;
      if (order === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });

    // Calculate statistics
    const stats = {
      totalResponses: allResponses.length,
      totalUsers: users.length,
      averageRating: 0,
      averageHelpfulness: 0,
      averageDifficulty: 0,
      averageWillingness: 0,
      experienceBreakdown: {},
      ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    };

    let ratingSum = 0, helpfulnessSum = 0, difficultySum = 0, willingnessSum = 0;
    let ratingCount = 0, helpfulnessCount = 0, difficultyCount = 0, willingnessCount = 0;

    for (const response of allResponses) {
      if (response.rating) {
        ratingSum += response.rating;
        ratingCount++;
        stats.ratingDistribution[response.rating]++;
      }
      if (response.helpfulness) {
        helpfulnessSum += response.helpfulness;
        helpfulnessCount++;
      }
      if (response.difficulty) {
        difficultySum += response.difficulty;
        difficultyCount++;
      }
      if (response.willingness !== undefined && response.willingness !== null) {
        willingnessSum += response.willingness;
        willingnessCount++;
      }
      if (response.experience) {
        stats.experienceBreakdown[response.experience] =
          (stats.experienceBreakdown[response.experience] || 0) + 1;
      }
    }

    stats.averageRating = ratingCount > 0 ? (ratingSum / ratingCount).toFixed(2) : 0;
    stats.averageHelpfulness = helpfulnessCount > 0 ? (helpfulnessSum / helpfulnessCount).toFixed(2) : 0;
    stats.averageDifficulty = difficultyCount > 0 ? (difficultySum / difficultyCount).toFixed(2) : 0;
    stats.averageWillingness = willingnessCount > 0 ? (willingnessSum / willingnessCount).toFixed(2) : 0;

    // Pagination
    const paginatedResponses = allResponses.slice(parseInt(skip), parseInt(skip) + parseInt(limit));

    res.json({
      success: true,
      stats,
      responses: paginatedResponses,
      pagination: {
        total: allResponses.length,
        limit: parseInt(limit),
        skip: parseInt(skip),
        hasMore: parseInt(skip) + parseInt(limit) < allResponses.length
      }
    });

  } catch (err) {
    console.error('Error fetching survey responses for admin:', err);
    res.status(500).json({
      success: false,
      message: 'Server error fetching survey responses.'
    });
  }
});

/**
 * @route   GET /api/admin/survey-stats
 * @desc    Get aggregated statistics for survey responses
 * @access  Private (Admin)
 */
router.get('/survey-stats', isAdmin, async (req, res) => {
  try {
    const users = await User.find(
      {},
      'sessionSurveys.responses sessionSurveys.responsesCount tourCompleted tourDismissed'
    ).lean();

    const stats = {
      totalUsers: users.length,
      usersWithResponses: 0,
      totalResponses: 0,
      tourCompletedCount: 0,
      tourDismissedCount: 0,
      averageResponsesPerUser: 0,
      recentResponses: []
    };

    for (const user of users) {
      if (user.tourCompleted) stats.tourCompletedCount++;
      if (user.tourDismissed) stats.tourDismissedCount++;

      if (user.sessionSurveys && user.sessionSurveys.responses && user.sessionSurveys.responses.length > 0) {
        stats.usersWithResponses++;
        stats.totalResponses += user.sessionSurveys.responses.length;
      }
    }

    stats.averageResponsesPerUser = stats.usersWithResponses > 0
      ? (stats.totalResponses / stats.usersWithResponses).toFixed(2)
      : 0;

    res.json({
      success: true,
      stats
    });

  } catch (err) {
    console.error('Error fetching survey stats for admin:', err);
    res.status(500).json({
      success: false,
      message: 'Server error fetching survey statistics.'
    });
  }
});

// =====================================================
// LEARNING CURVE: View any student's skill progression
// =====================================================
router.get('/students/:studentId/learning-curve', isAdmin, async (req, res) => {
  try {
    const student = await User.findById(req.params.studentId).lean();
    if (!student) return res.status(404).json({ message: 'Student not found.' });

    const skillsOverview = [];
    for (const [skillId, skillData] of Object.entries(student.skillMastery || {})) {
      const practiceHistory = skillData.practiceHistory || [];
      if (practiceHistory.length === 0) continue;

      const firstTheta = practiceHistory[0]?.theta || 0;
      const currentTheta = skillData.theta || 0;

      skillsOverview.push({
        skillId,
        displayName: skillId.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
        currentTheta,
        growth: currentTheta - firstTheta,
        practiceCount: practiceHistory.length,
        masteryScore: skillData.masteryScore || 0,
        pillars: skillData.pillars || null,
        status: skillData.status || 'learning',
        lastPracticed: skillData.lastPracticed,
        curveData: practiceHistory.map(e => ({
          timestamp: e.timestamp,
          theta: e.theta || 0,
          standardError: e.standardError || 1.0,
          correct: e.correct,
          problemDifficulty: e.difficulty || 0
        }))
      });
    }

    skillsOverview.sort((a, b) => {
      const dateA = a.lastPracticed ? new Date(a.lastPracticed) : new Date(0);
      const dateB = b.lastPracticed ? new Date(b.lastPracticed) : new Date(0);
      return dateB - dateA;
    });

    res.json({
      success: true,
      student: { id: student._id, name: `${student.firstName} ${student.lastName}`, gradeLevel: student.gradeLevel },
      skills: skillsOverview,
      totalSkillsPracticed: skillsOverview.length
    });
  } catch (error) {
    console.error('Error fetching student learning curve:', error);
    res.status(500).json({ message: 'Error fetching learning curve data' });
  }
});

// =====================================================
// CELERATION: View any student's fact fluency progress
// =====================================================
router.get('/students/:studentId/celeration', isAdmin, async (req, res) => {
  try {
    const student = await User.findById(req.params.studentId).lean();
    if (!student) return res.status(404).json({ message: 'Student not found.' });

    const grade = parseInt(student.gradeLevel);
    const aim = grade >= 9 ? 60 : grade >= 6 ? 50 : 40;
    const familiesData = [];

    for (const [familyKey, familyData] of Object.entries(student.factFluencyProgress?.factFamilies || {})) {
      if (!familyData.sessions || familyData.sessions.length === 0) continue;

      const sessions = familyData.sessions.map(s => ({
        date: s.date, rate: s.rate, accuracy: s.accuracy,
        problemsAttempted: s.problemsAttempted, problemsCorrect: s.problemsCorrect
      })).sort((a, b) => new Date(a.date) - new Date(b.date));

      const recentRates = sessions.slice(-3).map(s => s.rate).sort((a, b) => a - b);
      const currentRate = recentRates[Math.floor(recentRates.length / 2)];

      familiesData.push({
        familyKey,
        operation: familyData.operation,
        familyName: familyData.familyName,
        displayName: familyData.displayName,
        currentRate,
        bestRate: familyData.bestRate || 0,
        atAim: currentRate >= aim,
        mastered: familyData.mastered || false,
        sessionCount: sessions.length,
        lastPracticed: familyData.lastPracticed,
        sessions
      });
    }

    res.json({
      success: true,
      student: { id: student._id, name: `${student.firstName} ${student.lastName}` },
      aim,
      families: familiesData
    });
  } catch (error) {
    console.error('Error fetching student celeration:', error);
    res.status(500).json({ message: 'Error fetching celeration data' });
  }
});

// =====================================================
// PLACEMENT RESULTS: View any student's screener/placement details
// =====================================================
router.get('/students/:studentId/placement-results', isAdmin, async (req, res) => {
  try {
    const student = await User.findById(req.params.studentId).lean();
    if (!student) return res.status(404).json({ message: 'Student not found.' });

    let theta = null, percentile = null;
    if (student.initialPlacement) {
      const match = student.initialPlacement.match(/Theta:\s*([-\d.]+)\s*\((\d+)th percentile\)/);
      if (match) { theta = parseFloat(match[1]); percentile = parseInt(match[2]); }
    }

    const screenerSessions = await ScreenerSession.find({ userId: student._id })
      .sort({ startTime: -1 }).limit(10).lean();

    const growthHistory = student.learningProfile?.growthCheckHistory || [];

    res.json({
      success: true,
      student: {
        id: student._id, name: `${student.firstName} ${student.lastName}`,
        gradeLevel: student.gradeLevel, mathCourse: student.mathCourse,
        teacherId: student.teacherId
      },
      initialPlacement: {
        completed: student.learningProfile?.assessmentCompleted || false,
        date: student.learningProfile?.assessmentDate,
        theta, percentile,
        raw: student.initialPlacement
      },
      screenerSessions: screenerSessions.map(s => ({
        id: s._id,
        type: s.mode || 'starting-point',
        startTime: s.startTime,
        endTime: s.endTime,
        duration: s.endTime && s.startTime ? s.endTime - s.startTime : null,
        questionsAnswered: s.questionCount || 0,
        finalTheta: s.theta,
        standardError: s.standardError,
        completed: !!s.endTime
      })),
      growthHistory: growthHistory.map(g => ({
        date: g.date,
        theta: g.theta,
        previousTheta: g.previousTheta,
        growth: g.thetaChange,
        status: g.growthStatus,
        questionsAnswered: g.questionsAnswered
      }))
    });
  } catch (error) {
    console.error('Error fetching student placement results:', error);
    res.status(500).json({ message: 'Error fetching placement results' });
  }
});

module.exports = router;