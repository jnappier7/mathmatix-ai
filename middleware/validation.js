/**
 * Input Validation Middleware using express-validator
 *
 * Provides comprehensive validation for authentication and user input
 * to prevent injection attacks, XSS, and invalid data
 */

const { body, validationResult } = require('express-validator');
const logger = require('../utils/logger');

/**
 * Validation Rules
 */

// Username validation
const validateUsername = () =>
  body('username')
    .trim()
    .isLength({ min: 3, max: 30 })
    .withMessage('Username must be between 3 and 30 characters')
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('Username can only contain letters, numbers, underscores, and hyphens')
    .escape();

// Email validation
const validateEmail = () =>
  body('email')
    .trim()
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail()
    .isLength({ max: 100 })
    .withMessage('Email must be less than 100 characters');

// Password validation
const validatePassword = () =>
  body('password')
    .isLength({ min: 8, max: 128 })
    .withMessage('Password must be between 8 and 128 characters')
    .matches(/^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[@$!%*?&#^()_+\-=\[\]{};':"\\|,.<>\/])/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character');

// Name validation (first/last name)
const validateName = (field) =>
  body(field)
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage(`${field} must be between 1 and 50 characters`)
    .matches(/^[a-zA-Z\s'-]+$/)
    .withMessage(`${field} can only contain letters, spaces, hyphens, and apostrophes`)
    .escape();

// Grade level validation
const validateGradeLevel = () =>
  body('gradeLevel')
    .optional()
    .isIn(['K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', 'College'])
    .withMessage('Invalid grade level');

// Learning style validation
const validateLearningStyle = () =>
  body('learningStyle')
    .optional()
    .isIn(['Visual', 'Auditory', 'Kinesthetic', 'Reading/Writing'])
    .withMessage('Invalid learning style');

// Tone preference validation
const validateTonePreference = () =>
  body('tonePreference')
    .optional()
    .isIn(['Formal', 'Casual', 'Encouraging', 'Direct'])
    .withMessage('Invalid tone preference');

// Math course validation
const validateMathCourse = () =>
  body('mathCourse')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Math course must be less than 100 characters')
    .escape();

// Reset token validation
const validateResetToken = () =>
  body('token')
    .trim()
    .isLength({ min: 32, max: 128 })
    .withMessage('Invalid reset token')
    .matches(/^[a-zA-Z0-9]+$/)
    .withMessage('Reset token contains invalid characters');

/**
 * Validation Rule Sets for Different Routes
 */

const loginValidation = [
  validateEmail(),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
];

const signupValidation = [
  validateUsername(),
  validateEmail(),
  validatePassword(),
  body('confirmPassword')
    .custom((value, { req }) => value === req.body.password)
    .withMessage('Passwords do not match'),
  validateName('firstName'),
  validateName('lastName'),
  validateGradeLevel(),
  validateLearningStyle(),
  validateTonePreference(),
  validateMathCourse(),
  body('interests')
    .optional()
    .isArray()
    .withMessage('Interests must be an array')
];

const passwordResetRequestValidation = [
  validateEmail()
];

const passwordResetValidation = [
  validateResetToken(),
  validatePassword(),
  body('confirmPassword')
    .custom((value, { req }) => value === req.body.password)
    .withMessage('Passwords do not match')
];

const changePasswordValidation = [
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),
  validatePassword(),
  body('confirmPassword')
    .custom((value, { req }) => value === req.body.password)
    .withMessage('Passwords do not match')
];

const updateProfileValidation = [
  validateName('firstName').optional(),
  validateName('lastName').optional(),
  validateGradeLevel(),
  validateLearningStyle(),
  validateTonePreference(),
  validateMathCourse()
];

/**
 * Error Handler Middleware
 * Processes validation results and returns errors
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(err => ({
      field: err.path,
      message: err.msg
    }));

    logger.warn('Validation failed', {
      path: req.path,
      method: req.method,
      errors: errorMessages,
      ip: req.ip
    });

    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errorMessages
    });
  }

  next();
};

/**
 * Sanitization Middleware
 * Additional sanitization for message content (chat, etc.)
 */
const sanitizeMessage = () =>
  body('message')
    .trim()
    .isLength({ min: 1, max: 10000 })
    .withMessage('Message must be between 1 and 10000 characters')
    .escape(); // Prevents XSS by escaping HTML

const chatMessageValidation = [
  sanitizeMessage()
];

/**
 * Export validation chains and handler
 */
module.exports = {
  // Validation rule sets
  loginValidation,
  signupValidation,
  passwordResetRequestValidation,
  passwordResetValidation,
  changePasswordValidation,
  updateProfileValidation,
  chatMessageValidation,

  // Individual validators (for custom use)
  validateUsername,
  validateEmail,
  validatePassword,
  validateName,
  validateGradeLevel,
  validateLearningStyle,
  validateTonePreference,
  validateMathCourse,
  validateResetToken,
  sanitizeMessage,

  // Error handler
  handleValidationErrors
};
