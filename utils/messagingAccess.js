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

/**
 * Which side of a teacher↔parent thread each account is on.
 *
 * routes/messaging.js has already established the pairing by the time a message
 * is sent — it authorizes on roles HELD, matching a teacher against their
 * students' parents and vice versa. This resolves that pairing back out for the
 * surfaces that need to NAME it: the sender's label in the notification email
 * and the dashboard the recipient's "open this message" link points at.
 *
 * Both of those used to read `sender.role` / `recipient.role`, the ACTIVE role
 * (CLAUDE.md §12), which is the wrong field twice over here. It is a snapshot
 * of a dashboard toggle, and it belongs to a moment that has already passed by
 * the time the mail is opened: a teacher who also holds parent, sending from
 * the teacher dashboard while `role` still said 'parent', signed their message
 * "(Parent)" and sent the recipient to a dashboard the thread is not on.
 *
 * Counterparts first — the pair is what the thread is — then a held role on its
 * own, so a same-role pair or a one-sided account still resolves to something
 * usable rather than silently defaulting to 'parent'.
 *
 * @param {Object} sender
 * @param {Object} recipient
 * @returns {{ senderRole: 'teacher'|'parent', recipientRole: 'teacher'|'parent' }}
 */
function messagingThreadRoles(sender, recipient) {
  const senderIsTeacher = userHasRole(sender, 'teacher');
  const senderIsParent = userHasRole(sender, 'parent');
  const recipientIsTeacher = userHasRole(recipient, 'teacher');
  const recipientIsParent = userHasRole(recipient, 'parent');

  // The unambiguous pairings.
  if (senderIsTeacher && recipientIsParent && !recipientIsTeacher) {
    return { senderRole: 'teacher', recipientRole: 'parent' };
  }
  if (senderIsParent && recipientIsTeacher && !recipientIsParent) {
    return { senderRole: 'parent', recipientRole: 'teacher' };
  }

  // Both hold both, or one holds neither: fall back to each account's own
  // strongest held role, preferring teacher, and keep 'parent' as the last
  // resort so the shape of the return value never changes.
  const own = (isTeacher, isParent) => (isTeacher ? 'teacher' : (isParent ? 'parent' : 'parent'));
  return {
    senderRole: own(senderIsTeacher, senderIsParent),
    recipientRole: own(recipientIsTeacher, recipientIsParent),
  };
}

module.exports = { canUseMessaging, messagingViewRole, messagingThreadRoles };
