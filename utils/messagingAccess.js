/**
 * Role logic for teacher <-> parent messaging.
 *
 * Split out of routes/messaging.js so it can be unit-tested without pulling in
 * express and the model layer. The two functions here pull in opposite
 * directions and the distinction is easy to get wrong — see CLAUDE.md §12.
 *
 * @module utils/messagingAccess
 */

const { userHasRole } = require('./roleQuery');

/**
 * May this account use messaging at all?
 *
 * AUTHORIZATION — reads roles[] (roles HELD), never `role` (the dashboard the
 * user currently has open). Gating on the active role locked out an admin who
 * is also a parent, and made a teacher-parent's access flip when they switched
 * dashboards.
 *
 * @param {Object|null} user
 * @returns {boolean}
 */
function canUseMessaging(user) {
  return !!user && (userHasRole(user, 'teacher') || userHasRole(user, 'parent'));
}

/**
 * Which contact list should this account see?
 *
 * VIEW ROUTING — legitimately prefers the ACTIVE role, because a teacher-parent
 * viewing the teacher dashboard wants their students' parents, not their own
 * child's teachers. Falls back to a held role so a multi-role account viewing
 * some other dashboard still gets a usable list instead of an empty one.
 *
 * @param {Object} user
 * @returns {'teacher'|'parent'|null}
 */
function messagingViewRole(user) {
  if (!user) return null;
  if (user.role === 'teacher' || user.role === 'parent') return user.role;
  if (userHasRole(user, 'teacher')) return 'teacher';
  if (userHasRole(user, 'parent')) return 'parent';
  return null;
}

module.exports = { canUseMessaging, messagingViewRole };
