/**
 * Who may read or change a student's upload-retention setting.
 *
 * Split out of routes/settings.js, which carried this rule twice — once on the
 * POST and once on the GET, drifting apart character by character. Lifting it
 * here follows utils/resourceVisibility.js: the rule gets unit tests without
 * pulling in express or the model layer, and the two endpoints can no longer
 * disagree about who is allowed.
 *
 * @module utils/uploadRetentionAccess
 */

const { userHasRole } = require('./roleQuery');

/**
 * @param {Object|null} actor      - the authenticated user making the request
 * @param {Object|null} student    - the target student document
 * @param {String} studentId       - the target id as it arrives off req.params
 *                                   or req.body (a STRING, while actor.children
 *                                   entries and student.teacherId are ObjectIds)
 * @returns {{ allowed: boolean, reason: string|null }}
 *          `reason` names the grant that succeeded ('admin' | 'parent' |
 *          'teacher' | 'self') and feeds the audit log line; it is null when
 *          nothing granted.
 */
function uploadRetentionAccess(actor, student, studentId) {
  if (!actor || !studentId) return { allowed: false, reason: null };

  const id = String(studentId);

  // Every test below reads the roles the actor HOLDS, never `actor.role` — the
  // dashboard they happen to have open (CLAUDE.md §12). Two things went wrong
  // on the active role:
  //
  //  • An admin who also holds parent could not touch a student's retention
  //    setting from any view but the admin dashboard.
  //  • The grants were an if/else-if chain, so an account only ever got the
  //    reach of whichever role matched first. A teacher who also holds parent
  //    fell into the parent branch, failed the children check, and was refused
  //    a student who was plainly on their own roster — the else-if meant the
  //    teacher branch never ran.
  //
  // So the grants are unioned, not dispatched, and ordered from widest to
  // narrowest so `reason` names the strongest one that applied.

  if (userHasRole(actor, 'admin')) {
    return { allowed: true, reason: 'admin' };
  }

  if (userHasRole(actor, 'parent')) {
    const isParentOfStudent = (actor.children || []).some(
      (childId) => String(childId) === id
    );
    if (isParentOfStudent) return { allowed: true, reason: 'parent' };
  }

  if (userHasRole(actor, 'teacher')) {
    const isTeacherOfStudent = !!(student && student.teacherId &&
      String(student.teacherId) === String(actor._id));
    if (isTeacherOfStudent) return { allowed: true, reason: 'teacher' };
  }

  // A student may set their own retention preference — and only their own.
  if (userHasRole(actor, 'student') && String(actor._id) === id) {
    return { allowed: true, reason: 'self' };
  }

  return { allowed: false, reason: null };
}

module.exports = { uploadRetentionAccess };
