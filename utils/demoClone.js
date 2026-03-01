// utils/demoClone.js
// Per-session demo cloning — each visitor gets their own isolated copy
// of demo data so concurrent users never interfere with each other.

const mongoose = require('mongoose');
const User = require('../models/user');
const Conversation = require('../models/conversation');
const EnrollmentCode = require('../models/enrollmentCode');
const logger = require('./logger');

const {
  DEMO_IDS,
  DEMO_PASSWORD,
  teacherRivera,
  isCooper,
  parentChen,
  studentMaya,
  studentAlex,
  studentJordan,
  teacherForChenKids,
  mockStudents,
  enrollmentCode: enrollmentCodeData,
  enrollmentCodeIS: enrollmentCodeISData,
  buildConversations,
} = require('./demoData');

// Map demoProfileId → template + the "world" of related users to clone
const PROFILE_TEMPLATES = {
  'teacher-rivera': teacherRivera,
  'is-cooper': isCooper,
  'parent-chen': parentChen,
  'student-maya': studentMaya,
  'student-alex': studentAlex,
  'student-jordan': studentJordan,
};

// Clone expiration (2 hours)
const CLONE_TTL_MS = 2 * 60 * 60 * 1000;

/**
 * Define which users + enrollment codes belong to each demo profile's "world".
 * When a profile is cloned, all users in its world are cloned together.
 */
function getWorldForProfile(profileId) {
  switch (profileId) {
    case 'teacher-rivera':
      return {
        primaryUser: teacherRivera,
        relatedUsers: [studentJordan, ...mockStudents],
        enrollmentCodes: [enrollmentCodeData],
        // All related users get teacherId remapped to cloned teacher
        remapTeacherId: true,
      };

    case 'is-cooper':
      // Cooper's intervention group: Jordan + Jasmine (mock07) + Tyler (mock08)
      return {
        primaryUser: isCooper,
        relatedUsers: [studentJordan, mockStudents[6], mockStudents[7]],
        enrollmentCodes: [enrollmentCodeISData],
        remapTeacherId: true,
      };

    case 'parent-chen':
      return {
        primaryUser: parentChen,
        relatedUsers: [studentMaya, studentAlex],
        enrollmentCodes: [],
        // Parent's children[] array gets remapped to cloned child IDs
        remapChildren: true,
      };

    case 'student-maya':
      return {
        primaryUser: studentMaya,
        relatedUsers: [],
        enrollmentCodes: [],
      };

    case 'student-alex':
      return {
        primaryUser: studentAlex,
        relatedUsers: [],
        enrollmentCodes: [],
      };

    case 'student-jordan':
      return {
        primaryUser: studentJordan,
        relatedUsers: [],
        enrollmentCodes: [],
      };

    default:
      return null;
  }
}

/**
 * Create a per-session demo clone.
 * Returns the cloned primary user (logged-in user) with a fresh _id.
 *
 * @param {string} profileId - e.g., 'teacher-rivera'
 * @returns {Promise<{user: Object, cloneSessionId: string}>}
 */
async function createDemoClone(profileId) {
  const world = getWorldForProfile(profileId);
  if (!world) {
    throw new Error(`Unknown demo profile: ${profileId}`);
  }

  // Clean up any expired clones opportunistically
  cleanupExpiredClones().catch(err =>
    logger.error('[DemoClone] Background cleanup error:', err)
  );

  const cloneSessionId = new mongoose.Types.ObjectId().toString();
  const cloneExpiresAt = new Date(Date.now() + CLONE_TTL_MS);
  const suffix = cloneSessionId.slice(-8); // Short suffix for unique usernames

  // Build ID mapping: original template _id → fresh clone _id
  const idMap = new Map();
  function mapId(originalId) {
    const key = originalId.toString();
    if (!idMap.has(key)) {
      idMap.set(key, new mongoose.Types.ObjectId());
    }
    return idMap.get(key);
  }

  // Pre-generate IDs for all users in the world
  mapId(world.primaryUser._id);
  for (const user of world.relatedUsers) {
    mapId(user._id);
  }

  // --- Clone users ---
  const allUserDocs = [];

  // Clone the primary (loginable) user
  const primaryDoc = buildCloneDoc(
    world.primaryUser, mapId(world.primaryUser._id), suffix,
    cloneSessionId, cloneExpiresAt
  );
  // Remap parent's children array if needed
  if (world.remapChildren && primaryDoc.children) {
    primaryDoc.children = primaryDoc.children.map(childId => {
      const mapped = idMap.get(childId.toString());
      return mapped || childId;
    });
  }
  allUserDocs.push(primaryDoc);

  // Clone related users (students, children, etc.)
  for (const relUser of world.relatedUsers) {
    const doc = buildCloneDoc(
      relUser, mapId(relUser._id), suffix,
      cloneSessionId, cloneExpiresAt
    );
    // Remap teacherId to cloned teacher
    if (world.remapTeacherId && doc.teacherId) {
      const mappedTeacher = idMap.get(doc.teacherId.toString());
      if (mappedTeacher) {
        doc.teacherId = mappedTeacher;
      }
    }
    // Remap parentIds to cloned parent
    if (world.remapChildren && doc.parentIds) {
      doc.parentIds = doc.parentIds.map(pid => {
        const mapped = idMap.get(pid.toString());
        return mapped || pid;
      });
    }
    allUserDocs.push(doc);
  }

  // Bulk insert users (bypass pre-save hook to avoid re-hashing passwords)
  // We'll set passwordHash to a pre-hashed value instead
  const bcrypt = require('bcryptjs');
  const hashedPassword = await bcrypt.hash(DEMO_PASSWORD, 10);
  for (const doc of allUserDocs) {
    doc.passwordHash = hashedPassword;
  }

  await User.insertMany(allUserDocs);

  // --- Clone enrollment codes ---
  for (const ecTemplate of world.enrollmentCodes) {
    const clonedEC = {
      ...ecTemplate,
      _id: new mongoose.Types.ObjectId(),
      code: `${ecTemplate.code}-${suffix}`, // Unique code
      teacherId: mapId(ecTemplate.teacherId),
      enrolledStudents: (ecTemplate.enrolledStudents || []).map(e => ({
        ...e,
        studentId: mapId(e.studentId),
      })),
      createdBy: mapId(ecTemplate.createdBy || ecTemplate.teacherId),
    };
    await EnrollmentCode.create(clonedEC);
  }

  // --- Clone conversations ---
  const allConversations = buildConversations(DEMO_IDS);
  const clonedUserIds = new Set([...idMap.keys()]);

  const convDocs = [];
  const activeConvMap = new Map(); // userId → most recent active conv _id

  for (const conv of allConversations) {
    const originalUserId = conv.userId.toString();
    if (!clonedUserIds.has(originalUserId)) continue;

    const clonedConvId = new mongoose.Types.ObjectId();
    const clonedUserId = idMap.get(originalUserId);

    convDocs.push({
      ...conv,
      _id: clonedConvId,
      userId: clonedUserId,
    });

    if (conv.isActive) {
      activeConvMap.set(clonedUserId.toString(), clonedConvId);
    }
  }

  if (convDocs.length > 0) {
    await Conversation.insertMany(convDocs);
  }

  // Link active conversations to cloned users
  for (const [userId, convId] of activeConvMap) {
    await User.findByIdAndUpdate(userId, { activeConversationId: convId });
  }

  // Return the primary cloned user (the one to log in as)
  const loginUser = await User.findById(mapId(world.primaryUser._id));

  logger.info(`[DemoClone] Created clone session ${cloneSessionId} for profile ${profileId} (${allUserDocs.length} users, ${convDocs.length} conversations)`);

  return { user: loginUser, cloneSessionId };
}

/**
 * Build a clone document from a template user.
 * Generates unique username/email, sets clone metadata.
 */
function buildCloneDoc(template, newId, suffix, cloneSessionId, cloneExpiresAt) {
  const doc = { ...template };

  // New identity
  doc._id = newId;
  doc.username = `${template.username}-${suffix}`;
  doc.email = `${template.email.replace('@', `-${suffix}@`)}`;

  // Clone metadata
  doc.isDemoClone = true;
  doc.isDemo = true;
  doc.cloneSessionId = cloneSessionId;
  doc.cloneExpiresAt = cloneExpiresAt;

  // Reset session state
  doc.activeConversationId = null;
  doc.activeMasteryConversationId = null;
  doc.activeCourseSessionId = null;
  doc.lastLogin = null;
  doc.tourCompleted = false;
  doc.tourDismissed = false;

  // Remove fields Mongoose will manage
  delete doc.__v;
  delete doc.createdAt;
  delete doc.updatedAt;

  // Ensure OAuth IDs don't conflict (they have unique sparse indexes)
  delete doc.googleId;
  delete doc.microsoftId;
  delete doc.cleverId;

  return doc;
}

/**
 * Delete all data for a clone session.
 *
 * @param {string} cloneSessionId
 */
async function cleanupDemoClone(cloneSessionId) {
  if (!cloneSessionId) return;

  try {
    // Find cloned user IDs for conversation/enrollment cleanup
    const clonedUsers = await User.find({ cloneSessionId }, '_id').lean();
    const clonedUserIds = clonedUsers.map(u => u._id);

    // Delete conversations for cloned users
    const convResult = await Conversation.deleteMany({ userId: { $in: clonedUserIds } });

    // Delete enrollment codes created for this session
    // EnrollmentCode doesn't have cloneSessionId, so match by teacher ID
    const ecResult = await EnrollmentCode.deleteMany({ teacherId: { $in: clonedUserIds } });

    // Delete cloned users
    const userResult = await User.deleteMany({ cloneSessionId });

    logger.info(`[DemoClone] Cleaned up session ${cloneSessionId}: ${userResult.deletedCount} users, ${convResult.deletedCount} conversations, ${ecResult.deletedCount} enrollment codes`);
  } catch (err) {
    logger.error(`[DemoClone] Cleanup error for session ${cloneSessionId}:`, err);
  }
}

/**
 * Reset a clone session (delete + recreate).
 * Used by the "Start Over" button.
 *
 * @param {string} cloneSessionId
 * @param {string} profileId
 * @returns {Promise<{user: Object, cloneSessionId: string}>}
 */
async function resetDemoClone(cloneSessionId, profileId) {
  await cleanupDemoClone(cloneSessionId);
  return createDemoClone(profileId);
}

/**
 * Delete all expired clone sessions.
 * Called opportunistically on each demo login.
 */
async function cleanupExpiredClones() {
  const now = new Date();

  // Find all expired clone session IDs
  const expiredUsers = await User.find(
    { isDemoClone: true, cloneExpiresAt: { $lt: now } },
    'cloneSessionId'
  ).lean();

  const sessionIds = [...new Set(expiredUsers.map(u => u.cloneSessionId).filter(Boolean))];

  if (sessionIds.length === 0) return;

  // Find all expired user IDs for related cleanup
  const expiredUserIds = expiredUsers.map(u => u._id);

  await Promise.all([
    Conversation.deleteMany({ userId: { $in: expiredUserIds } }),
    EnrollmentCode.deleteMany({ teacherId: { $in: expiredUserIds } }),
    User.deleteMany({ isDemoClone: true, cloneExpiresAt: { $lt: now } }),
  ]);

  logger.info(`[DemoClone] Cleaned up ${sessionIds.length} expired clone sessions`);
}

module.exports = {
  createDemoClone,
  cleanupDemoClone,
  resetDemoClone,
  cleanupExpiredClones,
};
