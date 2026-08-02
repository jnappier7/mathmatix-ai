// utils/roleQuery.js
//
// Role matching for database queries and for role assertions on OTHER users.
//
// Two fields carry role information and they mean different things:
//   • `user.role`   — the ACTIVE role: which dashboard the user is currently in.
//                     A multi-role user flips this via /api/role-switch.
//   • `user.roles[]` — every role the user HOLDS. This is the durable fact.
//
// `middleware/auth.js` already authorizes off `roles[]`, so a multi-role user
// passes the gate. The bug this module exists to kill is everything downstream:
// a query like `User.findOne({ _id, role: 'parent' })` matches only the role the
// target happens to be *viewing right now*. An admin who is also a parent has
// role='admin' and roles=['admin','parent',...], so they silently vanish from
// every parent directory and every parent/student link lookup returns null —
// no error, just "not found".
//
// Rule of thumb: query by the roles a user HOLDS, never by the one they are
// currently viewing. Use `req.user.role` only to decide what to show the
// *acting* user (dashboard routing, which pane to open) — never to decide
// whether some *other* user is eligible to be found, listed, or linked.

const ROLE_NAMES = ['student', 'teacher', 'parent', 'admin'];

/**
 * A Mongo filter fragment matching users who HOLD `role`.
 * Checks `roles[]` first, with the legacy `role` string as a fallback so
 * documents written before `roles[]` was backfilled still match.
 *
 * Spread it into a filter:
 *   User.findOne({ _id: parentId, ...anyRole('parent') })
 *
 * Produces an `$or` key, so use `withRole()` instead when the filter already
 * has its own `$or`.
 */
function anyRole(role) {
  return { $or: [{ roles: role }, { role }] };
}

/**
 * Same as `anyRole()` but safe to combine with a filter that already carries an
 * `$or` (spreading would clobber it). Wraps both sides in `$and`.
 *
 *   withRole({ $or: [{ a: 1 }, { b: 2 }] }, 'student')
 */
function withRole(filter, role) {
  if (!filter || Object.keys(filter).length === 0) return anyRole(role);
  if (!Object.prototype.hasOwnProperty.call(filter, '$or')) {
    return { ...filter, ...anyRole(role) };
  }
  return { $and: [filter, anyRole(role)] };
}

/**
 * A Mongo filter fragment matching users who hold NONE of `roles`.
 * The inverse of `anyRole` — `{ role: { $ne: 'admin' } }` leaks multi-role
 * admins back into "everyone except admins" listings.
 */
function withoutRoles(...roles) {
  const excluded = roles.flat();
  return { roles: { $nin: excluded }, role: { $nin: excluded } };
}

/**
 * In-memory check: does this user document hold `role`?
 *
 * For asserting a role on a user you just loaded, where a bare
 * `user.role !== 'student'` would reject a multi-role account.
 * Mirrors `hasRole()` in `middleware/auth.js`, which stays where it is because
 * that one guards the request and this one inspects arbitrary documents.
 */
function userHasRole(user, role) {
  if (!user) return false;
  if (Array.isArray(user.roles) && user.roles.length > 0) {
    return user.roles.includes(role);
  }
  return String(user.role) === role;
}

/**
 * Every role a user holds, as an array — `roles[]` when populated, otherwise the
 * legacy single `role`. Use for display and for grouping users by role.
 */
function rolesOf(user) {
  if (!user) return [];
  if (Array.isArray(user.roles) && user.roles.length > 0) return user.roles;
  return user.role ? [user.role] : [];
}

module.exports = { anyRole, withRole, withoutRoles, userHasRole, rolesOf, ROLE_NAMES };
