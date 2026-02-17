// utils/demoReset.js
// Resets a demo account back to its initial state.
// Called on logout (and optionally on login) to ensure a fresh playground experience.

const User = require('../models/user');
const Conversation = require('../models/conversation');
const EnrollmentCode = require('../models/enrollmentCode');
const logger = require('./logger');

const {
  DEMO_IDS,
  ALL_DEMO_USER_IDS,
  teacherRivera,
  parentChen,
  studentMaya,
  studentAlex,
  studentJordan,
  teacherForChenKids,
  mockStudents,
  enrollmentCode: enrollmentCodeData,
  buildConversations,
} = require('./demoData');

// Map demoProfileId → template data
const PROFILE_TEMPLATES = {
  'teacher-rivera': teacherRivera,
  'parent-chen': parentChen,
  'student-maya': studentMaya,
  'student-alex': studentAlex,
  'student-jordan': studentJordan,
  'teacher-chen-kids': teacherForChenKids,
};

// Mock student templates keyed by their _id
const MOCK_STUDENT_MAP = {};
for (const ms of mockStudents) {
  MOCK_STUDENT_MAP[ms._id.toString()] = ms;
}

/**
 * Reset a single demo account to its initial state.
 * Restores user document fields and recreates related data (conversations, enrollment codes).
 *
 * @param {string} demoProfileId - The demo profile to reset (e.g., 'student-maya')
 * @returns {Promise<boolean>} true if reset was successful
 */
async function resetDemoAccount(demoProfileId) {
  const template = PROFILE_TEMPLATES[demoProfileId];
  if (!template) {
    logger.warn(`[DemoReset] Unknown demo profile: ${demoProfileId}`);
    return false;
  }

  const userId = template._id;

  try {
    // 1. Delete all conversations for this user
    await Conversation.deleteMany({ userId });

    // 2. Build the reset object from template (exclude _id and fields Mongoose manages)
    const resetFields = buildResetFields(template);

    // 3. Reset the user document
    const user = await User.findById(userId);
    if (!user) {
      logger.warn(`[DemoReset] Demo user not found: ${demoProfileId} (${userId})`);
      return false;
    }

    // Apply all template fields
    Object.assign(user, resetFields);

    // Reset fields that may have been modified during the session
    user.activeConversationId = null;
    user.activeMasteryConversationId = null;
    user.activeCourseSessionId = null;
    user.lastLogin = null;
    user.tourCompleted = false;
    user.tourDismissed = false;

    // Handle skillMastery (Map type) — must be set explicitly
    if (template.skillMastery) {
      user.skillMastery = template.skillMastery;
    } else {
      user.skillMastery = new Map();
    }

    await user.save();

    // 4. Recreate conversations for this user
    const conversations = buildConversations(DEMO_IDS);
    const userConversations = conversations.filter(c => c.userId.toString() === userId.toString());

    for (const convData of userConversations) {
      const conv = new Conversation(convData);
      await conv.save();

      // If this is the most recent active conversation, link it to the user
      if (convData.isActive) {
        user.activeConversationId = conv._id;
        await user.save();
      }
    }

    // 5. If this is a teacher, reset the enrollment code
    if (template.role === 'teacher' && demoProfileId === 'teacher-rivera') {
      await resetEnrollmentCode();
    }

    logger.info(`[DemoReset] Successfully reset demo account: ${demoProfileId}`);
    return true;
  } catch (err) {
    logger.error(`[DemoReset] Error resetting ${demoProfileId}:`, err);
    return false;
  }
}

/**
 * Reset all demo accounts at once.
 * Used by the seed script or an admin reset endpoint.
 */
async function resetAllDemoAccounts() {
  logger.info('[DemoReset] Resetting all demo accounts...');

  // Reset loginable accounts
  for (const profileId of Object.keys(PROFILE_TEMPLATES)) {
    await resetDemoAccount(profileId);
  }

  // Reset mock students (conversations only — they don't log in)
  for (const ms of mockStudents) {
    const userId = ms._id;
    await Conversation.deleteMany({ userId });

    // Recreate their conversations
    const conversations = buildConversations(DEMO_IDS);
    const userConversations = conversations.filter(c => c.userId.toString() === userId.toString());
    for (const convData of userConversations) {
      const conv = new Conversation(convData);
      await conv.save();

      // Link active conversation
      if (convData.isActive) {
        await User.findByIdAndUpdate(userId, { activeConversationId: conv._id });
      }
    }
  }

  logger.info('[DemoReset] All demo accounts reset successfully.');
}

/**
 * Reset the enrollment code for Ms. Rivera's class.
 */
async function resetEnrollmentCode() {
  try {
    await EnrollmentCode.deleteMany({ teacherId: DEMO_IDS.teacherRivera });
    const ec = new EnrollmentCode(enrollmentCodeData);
    await ec.save();
  } catch (err) {
    logger.error('[DemoReset] Error resetting enrollment code:', err);
  }
}

/**
 * Build a plain object with all resettable fields from a template.
 * Excludes _id and other immutable fields.
 */
function buildResetFields(template) {
  const reset = { ...template };

  // Remove fields that shouldn't be overwritten
  delete reset._id;
  delete reset.skillMastery; // Handled separately (Map type)

  // Ensure password is reset (pre-save hook will hash it)
  if (reset.passwordHash) {
    // passwordHash will be hashed by the pre-save hook
  }

  return reset;
}

module.exports = {
  resetDemoAccount,
  resetAllDemoAccounts,
  resetEnrollmentCode,
  PROFILE_TEMPLATES
};
