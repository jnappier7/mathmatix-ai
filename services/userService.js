// services/userService.js
// Business logic for user operations
// Centralizes user data access and manipulation

const logger = require('../utils/logger').child({ service: 'user-service' });
const User = require('../models/user');
const bcrypt = require('bcryptjs');
const BRAND_CONFIG = require('../utils/brand');

/**
 * Get user by ID with error handling
 * @param {string} userId - User ID
 * @param {object} options - Query options { select, populate }
 * @returns {Promise<User>} User document
 */
async function getUserById(userId, options = {}) {
  try {
    let query = User.findById(userId);

    if (options.select) {
      query = query.select(options.select);
    }

    if (options.populate) {
      query = query.populate(options.populate);
    }

    const user = await query.exec();

    if (!user) {
      logger.warn('User not found', { userId });
      return null;
    }

    return user;
  } catch (error) {
    logger.error('Failed to get user by ID', { userId, error });
    throw error;
  }
}

/**
 * Get user by username
 * @param {string} username - Username
 * @returns {Promise<User>} User document
 */
async function getUserByUsername(username) {
  try {
    const user = await User.findOne({ username: username.toLowerCase().trim() });

    if (!user) {
      logger.debug('User not found by username', { username });
      return null;
    }

    return user;
  } catch (error) {
    logger.error('Failed to get user by username', { username, error });
    throw error;
  }
}

/**
 * Get user by email
 * @param {string} email - Email address
 * @returns {Promise<User>} User document
 */
async function getUserByEmail(email) {
  try {
    const user = await User.findOne({ email: email.toLowerCase().trim() });

    if (!user) {
      logger.debug('User not found by email', { email });
      return null;
    }

    return user;
  } catch (error) {
    logger.error('Failed to get user by email', { email, error });
    throw error;
  }
}

/**
 * Create new user
 * @param {object} userData - User data
 * @returns {Promise<User>} Created user
 */
async function createUser(userData) {
  try {
    // Validate required fields
    const required = ['username', 'email', 'firstName', 'lastName'];
    for (const field of required) {
      if (!userData[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // Check for existing user
    const existingUsername = await getUserByUsername(userData.username);
    if (existingUsername) {
      throw new Error('Username already exists');
    }

    const existingEmail = await getUserByEmail(userData.email);
    if (existingEmail) {
      throw new Error('Email already exists');
    }

    // Hash password if provided
    if (userData.password) {
      const salt = await bcrypt.genSalt(10);
      userData.passwordHash = await bcrypt.hash(userData.password, salt);
      delete userData.password; // Don't store plaintext
    }

    const user = new User(userData);
    await user.save();

    logger.info('User created', {
      userId: user._id,
      username: user.username,
      role: user.role
    });

    return user;
  } catch (error) {
    logger.error('Failed to create user', { username: userData.username, error });
    throw error;
  }
}

/**
 * Update user profile
 * @param {string} userId - User ID
 * @param {object} updates - Fields to update
 * @returns {Promise<User>} Updated user
 */
async function updateUser(userId, updates) {
  try {
    // Prevent updating sensitive fields directly
    const blacklist = ['passwordHash', 'resetPasswordToken', 'resetPasswordExpires'];
    for (const field of blacklist) {
      if (updates[field]) {
        delete updates[field];
        logger.warn('Attempted to update blacklisted field', { userId, field });
      }
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!user) {
      throw new Error('User not found');
    }

    logger.info('User updated', {
      userId,
      updatedFields: Object.keys(updates)
    });

    return user;
  } catch (error) {
    logger.error('Failed to update user', { userId, error });
    throw error;
  }
}

/**
 * Award XP to user
 * @param {string} userId - User ID
 * @param {number} amount - XP amount to award
 * @param {string} reason - Reason for XP award
 * @returns {Promise<User>} Updated user
 */
async function awardXP(userId, amount, reason) {
  try {
    const user = await getUserById(userId);

    if (!user) {
      throw new Error('User not found');
    }

    const previousXP = user.xp;
    const previousLevel = user.level;

    user.xp += amount;

    // Track XP history
    user.xpHistory.push({
      date: new Date(),
      amount,
      reason
    });

    // Calculate level using brand config's cumulative XP formula
    let newLevel = user.level || 1;
    while (user.xp >= BRAND_CONFIG.cumulativeXpForLevel(newLevel + 1)) {
        newLevel++;
    }
    user.level = newLevel;

    await user.save();

    const leveledUp = newLevel > previousLevel;

    logger.info('XP awarded', {
      userId,
      amount,
      reason,
      previousXP,
      newXP: user.xp,
      leveledUp,
      newLevel
    });

    return {
      user,
      leveledUp,
      previousLevel,
      newLevel
    };
  } catch (error) {
    logger.error('Failed to award XP', { userId, amount, reason, error });
    throw error;
  }
}

/**
 * Update user's last login timestamp
 * @param {string} userId - User ID
 * @returns {Promise<User>} Updated user
 */
async function updateLastLogin(userId) {
  try {
    const user = await User.findByIdAndUpdate(
      userId,
      { $set: { lastLogin: new Date() } },
      { new: true }
    );

    if (!user) {
      throw new Error('User not found');
    }

    logger.debug('Updated last login', { userId });

    return user;
  } catch (error) {
    logger.error('Failed to update last login', { userId, error });
    throw error;
  }
}

/**
 * Get user statistics
 * @param {string} userId - User ID
 * @returns {Promise<object>} User statistics
 */
async function getUserStats(userId) {
  try {
    const user = await getUserById(userId);

    if (!user) {
      throw new Error('User not found');
    }

    const stats = {
      level: user.level,
      xp: user.xp,
      totalActiveTutoringMinutes: user.totalActiveTutoringMinutes || 0,
      problemsCompleted: user.problemsCompleted || 0,
      badgesEarned: user.badges?.length || 0,
      streakDays: user.currentStreak || 0,
      joinedDate: user.createdAt,
      lastLogin: user.lastLogin
    };

    logger.debug('Retrieved user stats', { userId });

    return stats;
  } catch (error) {
    logger.error('Failed to get user stats', { userId, error });
    throw error;
  }
}

/**
 * Check if user has required role
 * @param {User} user - User document
 * @param {string|Array<string>} roles - Required role(s)
 * @returns {boolean} Has required role
 */
function hasRole(user, roles) {
  if (!user || !user.role) {
    return false;
  }

  const allowedRoles = Array.isArray(roles) ? roles : [roles];
  return allowedRoles.includes(user.role);
}

/**
 * Validate password strength
 * @param {string} password - Password to validate
 * @returns {object} Validation result { valid: boolean, errors: Array<string> }
 */
function validatePassword(password) {
  const errors = [];

  if (!password || password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

module.exports = {
  getUserById,
  getUserByUsername,
  getUserByEmail,
  createUser,
  updateUser,
  awardXP,
  updateLastLogin,
  getUserStats,
  hasRole,
  validatePassword
};
