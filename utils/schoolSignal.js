/* ============================================================
   utils/schoolSignal.js — find the schools that are ready to buy.

   WHY THIS EXISTS
   ---------------
   The strongest published signal in K-12 product-led growth is teacher
   density inside one building: once roughly five teachers at a school are
   actively using a free tier, close rates on a school-wide license run an
   order of magnitude above cold outbound. Mathmatix gives teachers free
   unlimited access precisely to create that density — and then had no way to
   see it. `schoolLicenseId` is the only school affiliation on an account and
   it is set when a license is PURCHASED, so the field that identifies a
   school only exists once the school is already a customer. That is exactly
   backwards for finding the next one.

   THE PROXY
   ---------
   Teachers at the same school share an email domain
   (`@stcharles.k12.mo.us`). Clustering on the domain needs no new signup
   field, no teacher action, and — the reason it is worth doing at all — it
   works retroactively on every account already in the database.

   Its limits are real and are reported rather than hidden: a teacher who
   signed up with a personal address is invisible to it, one domain can span
   a whole district rather than one building, and a shared consumer domain
   would lump strangers together (which is why those are excluded outright,
   not merely down-weighted). Treat a cluster as a lead to verify, never as a
   confirmed roster.
   ============================================================ */

// Consumer mailbox providers. A cluster on one of these is not a school, it
// is a coincidence — 400 strangers on gmail.com must never surface as the
// hottest account in the pipeline. Excluded outright rather than ranked down.
const CONSUMER_EMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'ymail.com', 'hotmail.com',
  'outlook.com', 'live.com', 'msn.com', 'icloud.com', 'me.com', 'mac.com',
  'aol.com', 'protonmail.com', 'proton.me', 'zoho.com', 'gmx.com',
  'mail.com', 'yandex.com', 'comcast.net', 'verizon.net', 'att.net',
  'sbcglobal.net', 'cox.net', 'charter.net', 'bellsouth.net', 'example.com',
]);

// A teacher counts as "active" if they have logged in inside this window.
// Density only predicts a sale when the teachers are actually using it; a
// building full of dormant signups is not a warm account.
const ACTIVE_WINDOW_DAYS = 30;

// Teacher count at which outbound is worth a founder's time. Below this a
// cluster is a nurture target, not a call.
const READY_TEACHER_THRESHOLD = 3;

/**
 * Extract the email domain, lowercased. Returns null for anything that isn't
 * a usable address.
 */
function emailDomain(email) {
  if (typeof email !== 'string') return null;
  const at = email.lastIndexOf('@');
  if (at < 1 || at === email.length - 1) return null;
  const domain = email.slice(at + 1).trim().toLowerCase();
  return domain.includes('.') ? domain : null;
}

/**
 * True when a domain looks like an institution rather than a mailbox provider.
 */
function isInstitutionalDomain(domain) {
  return !!domain && !CONSUMER_EMAIL_DOMAINS.has(domain);
}

/**
 * Cluster teachers by email domain and rank the clusters by how ready each
 * looks for a school-license conversation.
 *
 * @param {object[]} teachers  Teacher accounts: { _id, email, lastLogin, schoolLicenseId }
 * @param {object[]} students  Student accounts: { _id, teacherId, totalActiveTutoringMinutes }
 * @param {object}   [opts]    { now } — injectable clock for tests.
 * @returns {object} { clusters, skipped }
 */
function buildSchoolSignals(teachers = [], students = [], opts = {}) {
  const now = opts.now ? new Date(opts.now) : new Date();
  const activeCutoff = new Date(now.getTime() - ACTIVE_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  // Students indexed by the teacher who owns them, so each cluster can total
  // the reach of its own teachers without re-scanning the roster.
  const studentsByTeacher = new Map();
  for (const s of students) {
    const key = s.teacherId ? String(s.teacherId) : null;
    if (!key) continue;
    if (!studentsByTeacher.has(key)) studentsByTeacher.set(key, []);
    studentsByTeacher.get(key).push(s);
  }

  const clusters = new Map();
  const skipped = { noDomain: 0, consumerDomain: 0 };

  for (const t of teachers) {
    const domain = emailDomain(t.email);
    if (!domain) { skipped.noDomain += 1; continue; }
    if (!isInstitutionalDomain(domain)) { skipped.consumerDomain += 1; continue; }

    if (!clusters.has(domain)) {
      clusters.set(domain, {
        domain,
        teachers: 0,
        activeTeachers: 0,
        students: 0,
        activeStudents: 0,
        tutoringMinutes: 0,
        licensedTeachers: 0,
        lastTeacherLoginAt: null,
      });
    }
    const c = clusters.get(domain);

    c.teachers += 1;
    if (t.lastLogin && new Date(t.lastLogin) >= activeCutoff) c.activeTeachers += 1;
    if (t.schoolLicenseId) c.licensedTeachers += 1;
    if (t.lastLogin) {
      const seen = new Date(t.lastLogin);
      if (!c.lastTeacherLoginAt || seen > c.lastTeacherLoginAt) c.lastTeacherLoginAt = seen;
    }

    for (const s of studentsByTeacher.get(String(t._id)) || []) {
      const minutes = Math.round(s.totalActiveTutoringMinutes || 0);
      c.students += 1;
      if (minutes > 0) c.activeStudents += 1;
      c.tutoringMinutes += minutes;
    }
  }

  const ranked = [...clusters.values()]
    .map((c) => ({
      ...c,
      lastTeacherLoginAt: c.lastTeacherLoginAt ? c.lastTeacherLoginAt.toISOString() : null,
      // A cluster where every teacher is already covered by a license is a
      // renewal, not a lead — the impact report is the artifact for those.
      alreadyLicensed: c.teachers > 0 && c.licensedTeachers === c.teachers,
      readyForOutreach:
        c.activeTeachers >= READY_TEACHER_THRESHOLD && c.licensedTeachers < c.teachers,
    }))
    // Active teachers first (the signal that actually predicts a close), then
    // student reach, then usage — each a tiebreak on the one before it.
    .sort((a, b) =>
      b.activeTeachers - a.activeTeachers ||
      b.activeStudents - a.activeStudents ||
      b.tutoringMinutes - a.tutoringMinutes ||
      a.domain.localeCompare(b.domain)
    );

  return {
    clusters: ranked,
    skipped,
    thresholds: {
      activeWindowDays: ACTIVE_WINDOW_DAYS,
      readyTeacherThreshold: READY_TEACHER_THRESHOLD,
    },
    caveats: [
      'Schools are inferred from teacher email domains, not from a school field — teachers who signed up with a personal address are missing from these counts entirely.',
      'One domain can cover a whole district rather than a single building, so a large cluster may be several schools.',
      'Consumer mailbox domains are excluded, so a school whose staff use personal email will not appear at all.',
      'Treat every cluster as a lead to verify before outreach, not a confirmed roster.',
    ],
  };
}

module.exports = {
  buildSchoolSignals,
  emailDomain,
  isInstitutionalDomain,
  CONSUMER_EMAIL_DOMAINS,
  ACTIVE_WINDOW_DAYS,
  READY_TEACHER_THRESHOLD,
};
