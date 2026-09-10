/* ============================================================
   utils/foundingSchool.js — the founding-school grant.

   St. Charles Prep (the founder's own school) gets Mathmatix+ free, granted
   by email domain: every account on a listed domain is treated as an
   Unlimited subscriber. Domain-based because the school's email addresses
   ARE its roster — no license record to provision, no teacher links to
   propagate, nothing for the school to administer.

   Why free, on the record: the founder teaches there, so selling to his own
   employer is a conflict of interest; giving it away dissolves the conflict
   instead of managing it, and turns the school into the reference customer
   the paid parochial pipeline is built on (docs/GROWTH_STRATEGY.md §3).

   Configuration: FOUNDING_SCHOOL_DOMAINS, comma-separated
   (e.g. "scprep.org"). Unset = feature entirely off. The env var is also the
   kill switch — unset it and the grant is gone on next deploy, which is the
   cost-control knob if usage ever outruns the ~$50-90/month a school of this
   size projects to.

   Matching is exact-domain (kid@scprep.org yes, kid@mail.scprep.org no) and
   case-insensitive. Read from env per call, not at module load, so tests and
   Render config changes behave predictably.

   One encoding is unwrapped first: Google's "conflicting account" address,
   `kid%scprep.org@gtempaccount.com`. Google issues it when a consumer Google
   account was created on a school address before the school adopted Workspace,
   and it is what the Google sign-in profile then reports as the email. The
   person verified ownership of kid@scprep.org to create that account, so the
   grant decodes it rather than walling off a real student. Two of the school's
   ~137 accounts arrived this way.

   Observability: `/api/health` reports how many domains are configured. Unset
   is a valid state (the kill switch), so it is a note there, not a degradation
   — but it is the first thing to check when a founding-school student reports
   a paywall, because that is exactly what an unset variable looks like.
   ============================================================ */

const { emailDomain } = require('./schoolSignal');

/** Parse FOUNDING_SCHOOL_DOMAINS into a lowercased list. */
function foundingSchoolDomains() {
  return (process.env.FOUNDING_SCHOOL_DOMAINS || '')
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

/** Google's conflicting-account domain; the real address is in the local part. */
const GOOGLE_CONFLICT_DOMAIN = 'gtempaccount.com';

/**
 * Unwrap `local%real.domain@gtempaccount.com` to `local@real.domain`.
 * Anything else — including a gtempaccount address with no `%` — is returned
 * unchanged, so the exact-domain rule below still decides.
 */
function unwrapGoogleConflictAddress(email) {
  if (emailDomain(email) !== GOOGLE_CONFLICT_DOMAIN) return email;
  const local = email.slice(0, email.lastIndexOf('@'));
  const pct = local.lastIndexOf('%');
  if (pct < 1 || pct === local.length - 1) return email;
  return `${local.slice(0, pct)}@${local.slice(pct + 1)}`;
}

/** True when this email is on a founding-school domain. */
function isFoundingSchoolEmail(email) {
  const domain = emailDomain(unwrapGoogleConflictAddress(email));
  if (!domain) return false;
  return foundingSchoolDomains().includes(domain);
}

/**
 * True when this account is covered by the founding-school grant.
 * Checks email and username — local/legacy accounts sign in with an email
 * address stored in `username` and may leave `email` unset.
 */
function isFoundingSchoolUser(user) {
  if (!user) return false;
  return isFoundingSchoolEmail(user.email) || isFoundingSchoolEmail(user.username);
}

/**
 * Mongo filter matching users whose email is on `domain` — how the impact
 * report scopes to a school that has no license record. Anchored, case-
 * insensitive, and regex-escaped so a domain can never smuggle a pattern.
 */
function emailDomainFilter(domain) {
  const escaped = String(domain).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return { email: new RegExp(`@${escaped}$`, 'i') };
}

module.exports = {
  foundingSchoolDomains,
  unwrapGoogleConflictAddress,
  isFoundingSchoolEmail,
  isFoundingSchoolUser,
  emailDomainFilter,
};
