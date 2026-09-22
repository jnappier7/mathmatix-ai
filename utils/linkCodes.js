// utils/linkCodes.js
//
// The ONE place that knows what the two family-linking codes look like.
//
// There are two codes and they travel in opposite directions:
//
//   parent → child   parentToChildInviteCode   "K7Q2ZP"        6 alphanumerics,
//                    made on the Parent Dashboard ("Generate Invite Code"),
//                    single-use, expires. The CHILD enters it (signup,
//                    onboarding, complete-profile).
//
//   child → parent   studentToParentLinkCode   "MATH-A1B2C3"   "MATH-" + 6 hex,
//                    shown under "Share Progress" in the student's tutor,
//                    single-use, never expires. The PARENT enters it
//                    (Parent Dashboard → "Link to Existing Student", or parent
//                    signup).
//
// A parent holding one and pasting it into the other side's box is the
// dominant support case ("my code says expired" when the code was never a
// parent code to begin with). Every route that consumes a code normalizes it
// here and, when the lookup misses, asks here whether the code looks like it
// belongs to the OTHER direction so the message can say so instead of
// "invalid, expired, or already used".

const STUDENT_CODE_PREFIX = 'MATH-';
const STUDENT_CODE_RE = /^(?:MATH-?)?([0-9A-F]{6})$/;
const STUDENT_CODE_SHAPE_RE = /^MATH-?[0-9A-F]{6}$/;
const PARENT_CODE_RE = /^[A-Z0-9]{6}$/;

// How long a parent's invite code stays valid. Parents generate the code on a
// laptop and the kid types it days later on a school Chromebook; 7 days
// produced "expired" support tickets from families who had done nothing wrong.
const PARENT_INVITE_TTL_DAYS = 30;

function squash(raw) {
  return String(raw == null ? '' : raw).replace(/\s+/g, '').toUpperCase();
}

/**
 * Canonicalize a student's share code. Accepts "MATH-A1B2C3", "math-a1b2c3",
 * "MATHA1B2C3", "a1b2c3" (the parent dashboard used to say "6-character code",
 * so parents typed exactly six), with any whitespace. Anything that does not
 * fit the shape is returned squashed so an exact lookup still has a chance.
 * Empty input → ''.
 */
function normalizeStudentLinkCode(raw) {
  const s = squash(raw);
  if (!s) return '';
  const m = s.match(STUDENT_CODE_RE);
  return m ? `${STUDENT_CODE_PREFIX}${m[1]}` : s;
}

/**
 * Canonicalize a parent's invite code: whitespace stripped, uppercased.
 * Empty input → ''.
 */
function normalizeParentInviteCode(raw) {
  return squash(raw);
}

/** Does this look like a child's "Share Progress" code (with its MATH prefix)? */
function looksLikeStudentLinkCode(raw) {
  return STUDENT_CODE_SHAPE_RE.test(squash(raw));
}

/** Does this look like a parent's dashboard invite code? */
function looksLikeParentInviteCode(raw) {
  return PARENT_CODE_RE.test(squash(raw));
}

function parentInviteExpiry(now = new Date()) {
  const d = new Date(now);
  d.setDate(d.getDate() + PARENT_INVITE_TTL_DAYS);
  return d;
}

function isParentInviteActive(invite, now = new Date()) {
  return !!(invite && invite.code && !invite.childLinked && invite.expiresAt && invite.expiresAt > now);
}

// ---------------------------------------------------------------------------
// Messages. Each names the cause AND the next action, because the person
// reading it is a parent on a phone who has already tried twice.
// ---------------------------------------------------------------------------

const PARENT_DASHBOARD_HINT = 'Parent Dashboard → "Generate Invite Code"';

/**
 * Why a child's attempt to use a parent invite code failed.
 * `parent` is whatever User.findOne({ 'parentToChildInviteCode.code': code, ...anyRole('parent') })
 * returned — possibly null. Returns { reason, message } or null when the
 * code is usable.
 */
function explainParentInviteFailure({ rawCode, parent, now = new Date() }) {
  if (!parent) {
    if (looksLikeStudentLinkCode(rawCode)) {
      return {
        reason: 'student_code',
        message: 'That is a student\'s "Share Progress" code, so it goes the other way: a parent enters it on the Parent Dashboard under "Link to Existing Student." ' +
                 `To link from here instead, ask your parent for the 6-character invite code from their ${PARENT_DASHBOARD_HINT}.`
      };
    }
    return {
      reason: 'not_found',
      message: 'We couldn\'t find a parent invite with that code. Double-check it with your parent, ' +
               `or ask them to make a fresh one (${PARENT_DASHBOARD_HINT}).`
    };
  }
  const invite = parent.parentToChildInviteCode || {};
  if (invite.childLinked) {
    return {
      reason: 'used',
      message: `That invite code has already been used. Ask ${parent.firstName || 'your parent'} to make a new one (${PARENT_DASHBOARD_HINT}) — each code links one child.`
    };
  }
  if (!invite.expiresAt || invite.expiresAt <= now) {
    const when = invite.expiresAt ? ` on ${invite.expiresAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : '';
    return {
      reason: 'expired',
      message: `That invite code expired${when}. Ask ${parent.firstName || 'your parent'} to make a new one (${PARENT_DASHBOARD_HINT}) — it takes one click and the new code lasts ${PARENT_INVITE_TTL_DAYS} days.`
    };
  }
  return null;
}

/**
 * Why a parent's attempt to use a child's share code failed.
 * `student` is the User found by the (normalized) code, or null. `parent` is
 * the caller. Returns { reason, message } or null when the code is usable.
 */
function explainStudentLinkFailure({ rawCode, student, parent }) {
  if (!student) {
    const ownInvite = parent && parent.parentToChildInviteCode && parent.parentToChildInviteCode.code;
    if (ownInvite && normalizeParentInviteCode(rawCode) === ownInvite) {
      return {
        reason: 'own_invite_code',
        message: 'That is the invite code you generated — it goes the other way. Your child enters it on their side (when they sign up, or under Profile → Link to Parent). ' +
                 'To link from here, enter the code shown under "Share Progress" in your child\'s tutor; it looks like MATH-A1B2C3.'
      };
    }
    return {
      reason: 'not_found',
      message: 'We couldn\'t find a student with that code. It looks like MATH-A1B2C3 and is shown under "Share Progress" in your child\'s tutor (the link icon in the top menu).'
    };
  }
  if (student.studentToParentLinkCode && student.studentToParentLinkCode.parentLinked) {
    const already = parent && (parent.children || []).some((c) => String(c && c._id ? c._id : c) === String(student._id));
    if (already) {
      return {
        reason: 'already_linked',
        message: `You're already linked to ${student.firstName || 'this student'}.`
      };
    }
    return {
      reason: 'used',
      message: `That code has already been used to link ${student.firstName || 'this student'} to a parent. Each code works once — ask ${student.firstName || 'them'} to open "Share Progress" in their tutor for a fresh code.`
    };
  }
  return null;
}

module.exports = {
  STUDENT_CODE_PREFIX,
  PARENT_INVITE_TTL_DAYS,
  normalizeStudentLinkCode,
  normalizeParentInviteCode,
  looksLikeStudentLinkCode,
  looksLikeParentInviteCode,
  parentInviteExpiry,
  isParentInviteActive,
  explainParentInviteFailure,
  explainStudentLinkFailure
};
