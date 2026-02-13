// services/cleverSync.js — Clever roster & section sync engine
//
// Two main entry points:
//   1. syncOnLogin(accessToken, user)  — called during Clever OAuth callback
//      Refreshes user profile, pulls their sections, and reconciles rosters.
//
//   2. syncSchoolRosters(schoolLicense, accessToken)  — admin-triggered full sync
//      Pulls ALL sections for a school and reconciles every roster.
//
// Design goals:
//   - Idempotent: safe to call on every login
//   - Additive by default: students are soft-removed (removedAt set) rather than deleted
//   - Creates local User stubs for Clever students not yet in the database

const User           = require('../models/user');
const Section        = require('../models/section');
const SchoolLicense  = require('../models/schoolLicense');
const EnrollmentCode = require('../models/enrollmentCode');
const cleverApi      = require('./cleverApi');
const { generateUniqueStudentLinkCode } = require('../routes/student');

/* ------------------------------------------------------------------ */
/*  Helper: map Clever grade string → Mathmatix gradeLevel            */
/* ------------------------------------------------------------------ */
function mapCleverGrade(cleverGrade) {
  if (!cleverGrade) return undefined;
  const g = String(cleverGrade).trim();
  // Clever uses "1"-"12", "PreKindergarten", "Kindergarten", "PostGraduate", etc.
  const numericMap = {
    '1': '1st Grade', '2': '2nd Grade', '3': '3rd Grade',
    '4': '4th Grade', '5': '5th Grade', '6': '6th Grade',
    '7': '7th Grade', '8': '8th Grade', '9': '9th Grade',
    '10': '10th Grade', '11': '11th Grade', '12': '12th Grade'
  };
  if (numericMap[g]) return numericMap[g];
  if (/kindergarten/i.test(g)) return 'Kindergarten';
  if (/prek/i.test(g)) return 'Pre-K';
  return g; // Pass through unknown values
}

/* ------------------------------------------------------------------ */
/*  Helper: generate a unique username for a new Clever user          */
/* ------------------------------------------------------------------ */
async function generateUsername(firstName, lastName, cleverId) {
  const base = `${firstName}${lastName}`.replace(/\s+/g, '').toLowerCase().slice(0, 20);
  if (base && !(await User.findOne({ username: base }))) return base;

  const withSuffix = `${base}_${cleverId.slice(0, 6)}`;
  if (!(await User.findOne({ username: withSuffix }))) return withSuffix;

  return `${base}_${Date.now().toString(36)}`;
}

/* ------------------------------------------------------------------ */
/*  1. Full profile refresh (called on every Clever login)            */
/* ------------------------------------------------------------------ */

/**
 * Refresh a user's profile fields from Clever and sync their sections.
 *
 * @param {string} accessToken - Clever Bearer token from current OAuth exchange
 * @param {object} user        - Mongoose User document (already found/created by passport)
 * @returns {Promise<{ user: object, sections: object[], stats: object }>}
 */
async function syncOnLogin(accessToken, user) {
  const stats = { profileUpdated: false, sectionsProcessed: 0, studentsAdded: 0, studentsRemoved: 0 };

  try {
    // ---- 1a. Identify user type via /me ----
    const meData = await cleverApi.getMe(accessToken);
    const cleverType = meData.type;   // 'student' | 'teacher' | 'district_admin' | 'school_admin'
    const cleverId   = meData.data?.id;
    if (!cleverId) return { user, sections: [], stats };

    // ---- 1b. Pull full profile ----
    const fullProfile = await cleverApi.getUserData(cleverType, cleverId, accessToken);
    const info = fullProfile.data || {};

    // Update local fields from Clever (source of truth for SSO-linked users)
    const updates = {};
    if (info.name?.first && info.name.first !== user.firstName) updates.firstName = info.name.first;
    if (info.name?.last  && info.name.last  !== user.lastName)  updates.lastName  = info.name.last;
    if (info.email && info.email !== user.email) updates.email = info.email;

    // Student-specific data
    if (cleverType === 'student') {
      const grade = mapCleverGrade(info.grade);
      if (grade && grade !== user.gradeLevel) updates.gradeLevel = grade;

      // Link to school license if district/school matches
      if (info.school) {
        const license = await SchoolLicense.findOne({
          $or: [
            { schoolId: info.school },
            { districtId: info.district }
          ],
          status: { $in: ['active', 'trial'] }
        });
        if (license && (!user.schoolLicenseId || !user.schoolLicenseId.equals(license._id))) {
          updates.schoolLicenseId = license._id;
        }
      }
    }

    // Teacher-specific: link school license
    if (cleverType === 'teacher' && info.school) {
      const license = await SchoolLicense.findOne({
        $or: [
          { schoolId: info.school },
          { districtId: info.district }
        ],
        status: { $in: ['active', 'trial'] }
      });
      if (license) {
        // Add teacher to license.teacherIds if not already present
        if (!license.teacherIds.some(tid => tid.equals(user._id))) {
          license.teacherIds.push(user._id);
          await license.save();
        }
      }
    }

    if (Object.keys(updates).length > 0) {
      Object.assign(user, updates);
      if (updates.firstName || updates.lastName) {
        user.name = `${user.firstName || ''} ${user.lastName || ''}`.trim();
      }
      await user.save();
      stats.profileUpdated = true;
    }

    // ---- 1c. Sync sections ----
    let sections = [];
    if (cleverType === 'teacher') {
      sections = await syncTeacherSections(accessToken, user, cleverId);
    } else if (cleverType === 'student') {
      sections = await syncStudentSections(accessToken, user, cleverId);
    }

    stats.sectionsProcessed = sections.length;
    for (const sec of sections) {
      stats.studentsAdded   += sec._syncStats?.added   || 0;
      stats.studentsRemoved += sec._syncStats?.removed || 0;
    }

    return { user, sections, stats };
  } catch (err) {
    console.error('ERROR [cleverSync.syncOnLogin]:', err.message);
    // Non-fatal: user can still log in even if sync fails
    return { user, sections: [], stats };
  }
}

/* ------------------------------------------------------------------ */
/*  Section sync for teachers                                         */
/* ------------------------------------------------------------------ */
async function syncTeacherSections(accessToken, teacher, teacherCleverId) {
  const cleverSections = await cleverApi.getTeacherSections(teacherCleverId, accessToken);
  const syncedSections = [];

  for (const cs of cleverSections) {
    const sData = cs.data || cs;
    const sectionId = sData.id;
    if (!sectionId) continue;

    // Upsert the Section document
    let section = await Section.findOne({ cleverSectionId: sectionId });
    if (!section) {
      section = new Section({ cleverSectionId: sectionId });
    }

    // Update section metadata from Clever
    section.name               = sData.name    || section.name;
    section.subject            = sData.subject || section.subject;
    section.course             = sData.course  || section.course;
    section.grade              = sData.grade   || section.grade;
    section.period             = sData.period  || section.period;
    section.cleverDistrictId   = sData.district || section.cleverDistrictId;
    section.cleverSchoolId     = sData.school   || section.cleverSchoolId;
    section.cleverCourseId     = sData.course   || section.cleverCourseId;
    section.teacherId          = teacher._id;
    section.lastSyncedAt       = new Date();
    section.syncSource         = 'login';

    if (sData.term) {
      section.termName      = sData.term.name       || section.termName;
      section.termStartDate = sData.term.start_date  || section.termStartDate;
      section.termEndDate   = sData.term.end_date    || section.termEndDate;
    }

    // Ensure teacher's Clever ID is in the teacherCleverIds array
    if (!section.teacherCleverIds.includes(teacherCleverId)) {
      section.teacherCleverIds.push(teacherCleverId);
    }

    // Link to school license
    if (section.cleverSchoolId || section.cleverDistrictId) {
      const license = await SchoolLicense.findOne({
        $or: [
          { schoolId: section.cleverSchoolId },
          { districtId: section.cleverDistrictId }
        ],
        status: { $in: ['active', 'trial'] }
      });
      if (license) section.schoolLicenseId = license._id;
    }

    // Pull student roster for this section
    const cleverStudents = await cleverApi.getSectionStudents(sectionId, accessToken);
    const newCleverIds = cleverStudents.map(s => (s.data || s).id).filter(Boolean);
    const diff = section.diffRoster(newCleverIds);

    // Process additions
    for (const studentCleverId of diff.added) {
      const studentData = cleverStudents.find(s => (s.data || s).id === studentCleverId);
      const sInfo = studentData?.data || studentData || {};

      // Find or create local user
      let studentUser = await User.findOne({ cleverId: studentCleverId });
      if (!studentUser && sInfo.email) {
        studentUser = await User.findOne({ email: sInfo.email });
      }

      if (!studentUser) {
        // Create stub user for this Clever student
        const firstName = sInfo.name?.first || 'Student';
        const lastName  = sInfo.name?.last  || studentCleverId.slice(0, 6);
        const username  = await generateUsername(firstName, lastName, studentCleverId);

        studentUser = new User({
          cleverId:    studentCleverId,
          firstName,
          lastName,
          name:        `${firstName} ${lastName}`,
          username,
          email:       sInfo.email || `${studentCleverId}@clever.placeholder`,
          role:        'student',
          roles:       ['student'],
          gradeLevel:  mapCleverGrade(sInfo.grade),
          teacherId:   teacher._id,
          emailVerified: true,
          needsProfileCompletion: true
        });

        // Generate link code
        try {
          const linkCode = await generateUniqueStudentLinkCode();
          studentUser.studentToParentLinkCode = { code: linkCode, parentLinked: false };
        } catch (_) { /* non-fatal */ }

        // Link to school license
        if (section.schoolLicenseId) {
          studentUser.schoolLicenseId = section.schoolLicenseId;
        }

        await studentUser.save();
      } else {
        // Existing user: update teacher link and Clever ID if missing
        const userUpdates = {};
        if (!studentUser.cleverId) userUpdates.cleverId = studentCleverId;
        if (!studentUser.teacherId || !studentUser.teacherId.equals(teacher._id)) {
          userUpdates.teacherId = teacher._id;
        }
        if (section.schoolLicenseId && (!studentUser.schoolLicenseId || !studentUser.schoolLicenseId.equals(section.schoolLicenseId))) {
          userUpdates.schoolLicenseId = section.schoolLicenseId;
        }
        if (Object.keys(userUpdates).length > 0) {
          Object.assign(studentUser, userUpdates);
          await studentUser.save();
        }
      }

      // Add to section roster
      section.students.push({
        studentId: studentUser._id,
        cleverId:  studentCleverId,
        enrolledAt: new Date()
      });
    }

    // Process removals (soft-remove)
    for (const studentCleverId of diff.removed) {
      const entry = section.students.find(s => s.cleverId === studentCleverId && !s.removedAt);
      if (entry) entry.removedAt = new Date();
    }

    section._syncStats = { added: diff.added.length, removed: diff.removed.length };
    await section.save();
    syncedSections.push(section);
  }

  return syncedSections;
}

/* ------------------------------------------------------------------ */
/*  Section sync for students (lighter — just links them to sections) */
/* ------------------------------------------------------------------ */
async function syncStudentSections(accessToken, student, studentCleverId) {
  const cleverSections = await cleverApi.getStudentSections(studentCleverId, accessToken);
  const syncedSections = [];

  for (const cs of cleverSections) {
    const sData = cs.data || cs;
    const sectionId = sData.id;
    if (!sectionId) continue;

    let section = await Section.findOne({ cleverSectionId: sectionId });
    if (!section) {
      // Section not yet created (teacher hasn't logged in yet) — create a stub
      section = new Section({
        cleverSectionId:  sectionId,
        name:             sData.name,
        subject:          sData.subject,
        course:           sData.course,
        grade:            sData.grade,
        period:           sData.period,
        cleverDistrictId: sData.district,
        cleverSchoolId:   sData.school,
        lastSyncedAt:     new Date(),
        syncSource:       'login'
      });
    }

    // Ensure student is in the roster
    const alreadyInRoster = section.students.some(
      s => s.cleverId === studentCleverId && !s.removedAt
    );
    if (!alreadyInRoster) {
      // Re-activate if previously removed, otherwise add
      const removed = section.students.find(s => s.cleverId === studentCleverId && s.removedAt);
      if (removed) {
        removed.removedAt = null;
        removed.enrolledAt = new Date();
      } else {
        section.students.push({
          studentId:  student._id,
          cleverId:   studentCleverId,
          enrolledAt: new Date()
        });
      }
    }

    // Link student to section's teacher if available
    if (section.teacherId && (!student.teacherId || !student.teacherId.equals(section.teacherId))) {
      student.teacherId = section.teacherId;
      await student.save();
    }

    section._syncStats = { added: alreadyInRoster ? 0 : 1, removed: 0 };
    await section.save();
    syncedSections.push(section);
  }

  return syncedSections;
}

/* ------------------------------------------------------------------ */
/*  2. Admin-triggered full school sync                               */
/* ------------------------------------------------------------------ */

/**
 * Sync ALL sections for a school license using the provided access token.
 * Typically called from an admin endpoint after obtaining a district-level token.
 *
 * @param {object} schoolLicense - SchoolLicense document
 * @param {string} accessToken   - District-admin-level Clever token
 * @returns {Promise<object>} { sectionsProcessed, studentsAdded, studentsRemoved, errors }
 */
async function syncSchoolRosters(schoolLicense, accessToken) {
  const result = { sectionsProcessed: 0, studentsAdded: 0, studentsRemoved: 0, errors: [] };

  try {
    const schoolId = schoolLicense.schoolId;
    if (!schoolId) {
      result.errors.push('School license has no Clever schoolId');
      return result;
    }

    const cleverSections = await cleverApi.getSchoolSections(schoolId, accessToken);

    for (const cs of cleverSections) {
      try {
        const sData = cs.data || cs;
        const sectionId = sData.id;
        if (!sectionId) continue;

        // Upsert section
        let section = await Section.findOne({ cleverSectionId: sectionId });
        if (!section) {
          section = new Section({ cleverSectionId: sectionId });
        }

        section.name             = sData.name    || section.name;
        section.subject          = sData.subject || section.subject;
        section.course           = sData.course  || section.course;
        section.grade            = sData.grade   || section.grade;
        section.period           = sData.period  || section.period;
        section.cleverDistrictId = sData.district || section.cleverDistrictId;
        section.cleverSchoolId   = sData.school   || section.cleverSchoolId;
        section.schoolLicenseId  = schoolLicense._id;
        section.lastSyncedAt     = new Date();
        section.syncSource       = 'admin';

        if (sData.term) {
          section.termName      = sData.term.name       || section.termName;
          section.termStartDate = sData.term.start_date  || section.termStartDate;
          section.termEndDate   = sData.term.end_date    || section.termEndDate;
        }

        // Resolve teacher(s) for this section
        const cleverTeachers = await cleverApi.getSectionTeachers(sectionId, accessToken);
        const teacherCleverIds = cleverTeachers.map(t => (t.data || t).id).filter(Boolean);
        section.teacherCleverIds = teacherCleverIds;

        // Set primary teacher (first one found in our DB)
        for (const tCleverId of teacherCleverIds) {
          const localTeacher = await User.findOne({ cleverId: tCleverId, role: 'teacher' });
          if (localTeacher) {
            section.teacherId = localTeacher._id;
            // Add teacher to license
            if (!schoolLicense.teacherIds.some(tid => tid.equals(localTeacher._id))) {
              schoolLicense.teacherIds.push(localTeacher._id);
            }
            break;
          }
        }

        // Pull students
        const cleverStudents = await cleverApi.getSectionStudents(sectionId, accessToken);
        const newCleverIds = cleverStudents.map(s => (s.data || s).id).filter(Boolean);
        const diff = section.diffRoster(newCleverIds);

        // Add new students
        for (const studentCleverId of diff.added) {
          const studentData = cleverStudents.find(s => (s.data || s).id === studentCleverId);
          const sInfo = studentData?.data || studentData || {};

          let studentUser = await User.findOne({ cleverId: studentCleverId });
          if (!studentUser && sInfo.email) {
            studentUser = await User.findOne({ email: sInfo.email });
          }

          if (!studentUser) {
            const firstName = sInfo.name?.first || 'Student';
            const lastName  = sInfo.name?.last  || studentCleverId.slice(0, 6);
            const username  = await generateUsername(firstName, lastName, studentCleverId);

            studentUser = new User({
              cleverId:    studentCleverId,
              firstName,
              lastName,
              name:        `${firstName} ${lastName}`,
              username,
              email:       sInfo.email || `${studentCleverId}@clever.placeholder`,
              role:        'student',
              roles:       ['student'],
              gradeLevel:  mapCleverGrade(sInfo.grade),
              teacherId:   section.teacherId || undefined,
              schoolLicenseId: schoolLicense._id,
              emailVerified: true,
              needsProfileCompletion: true
            });

            try {
              const linkCode = await generateUniqueStudentLinkCode();
              studentUser.studentToParentLinkCode = { code: linkCode, parentLinked: false };
            } catch (_) { /* non-fatal */ }

            await studentUser.save();
          } else {
            if (!studentUser.schoolLicenseId || !studentUser.schoolLicenseId.equals(schoolLicense._id)) {
              studentUser.schoolLicenseId = schoolLicense._id;
              await studentUser.save();
            }
          }

          section.students.push({
            studentId: studentUser._id,
            cleverId:  studentCleverId,
            enrolledAt: new Date()
          });

          result.studentsAdded++;
        }

        // Soft-remove departures
        for (const studentCleverId of diff.removed) {
          const entry = section.students.find(s => s.cleverId === studentCleverId && !s.removedAt);
          if (entry) entry.removedAt = new Date();
          result.studentsRemoved++;
        }

        await section.save();
        result.sectionsProcessed++;
      } catch (sectionErr) {
        result.errors.push(`Section ${(cs.data || cs).id}: ${sectionErr.message}`);
      }
    }

    // Update student count on license
    const activeStudentCount = await User.countDocuments({
      schoolLicenseId: schoolLicense._id,
      role: 'student'
    });
    schoolLicense.currentStudentCount = activeStudentCount;
    await schoolLicense.save();

  } catch (err) {
    result.errors.push(`Top-level sync error: ${err.message}`);
  }

  return result;
}

module.exports = {
  syncOnLogin,
  syncSchoolRosters,
  syncTeacherSections,
  syncStudentSections
};
