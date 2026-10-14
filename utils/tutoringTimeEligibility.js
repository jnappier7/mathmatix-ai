'use strict';
/* ============================================================
   tutoringTimeEligibility.js — whose seconds count as TUTORING time.

   /api/chat/track-time is posted by the shared SessionManager, which the
   teacher, parent and admin dashboard bundles also load. So a teacher
   reading the roster for ten minutes was credited ten tutoring minutes
   (prod: a teacher account at weeklyMinutes 42), inflating usage, impact
   and efficacy numbers that are sold to schools.

   Rule: only a student, acting as a student, accrues tutoring time.
     • Impersonation never counts — a teacher "viewing as" a student is not
       the student studying, and the minutes would land on the student.
     • The ACTIVE role decides, not roles held: a multi-role account
       (teacher who is also a student) accrues time only while in the
       student view. This is acting-user context, the job CLAUDE.md §12
       keeps `role` for.
   ============================================================ */

const NON_TUTORING_ROLES = new Set(['teacher', 'parent', 'admin']);

function shouldCountTutoringTime(req) {
  if (!req || !req.user) return false;
  if (req.isImpersonating || req.originalUser) return false;
  return !NON_TUTORING_ROLES.has(req.user.role);
}

module.exports = { shouldCountTutoringTime };
