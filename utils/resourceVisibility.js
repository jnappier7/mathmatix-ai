// utils/resourceVisibility.js
// Which teachers and classes a student belongs to, for scoping teacher-shared
// resources.
//
// A "class" in this codebase is an EnrollmentCode document: it carries the
// className, the owning teacherId, and an enrolledStudents[] list. A teacher
// can share an uploaded resource with specific classes
// (teacherResource.sharedWithClassIds), and every student-facing read has to be
// filtered against the classes that student is actually in.
//
// A STUDENT CAN HAVE MORE THAN ONE TEACHER, and `user.teacherId` does not say
// so. It is a single pointer that whichever join wrote last owns: joining a
// second teacher's class overwrites it (routes/student.js), and Clever sync
// assigns whichever section it processed last (services/cleverSync.js). The
// relationship itself is many-to-many and always has been — nothing stops a
// student being enrolled in two teachers' classes, and teacher.js's
// "one class at a time" rule is scoped per-teacher, which permits it by design.
// EnrollmentCode is where that full picture actually lives, so the teacher set
// is DERIVED from enrolment rather than read off the pointer. Trusting the
// pointer means a student with two teachers sees one teacher's materials and
// silently loses the other's the moment they join a new class.
//
// This lives in its own module rather than inside a route because THREE call
// sites need the same answer — the resources list, the download endpoint, and
// the AI tutor's resource lookup in routes/chat.js — and the third is the one
// that leaks quietly if it disagrees with the other two.

const EnrollmentCode = require('../models/enrollmentCode');

/**
 * Everything a student's resource visibility depends on, in one query.
 *
 * Returns { teacherIds, classIds }, both always ARRAYS, never null. That
 * matters: the model's visibleToStudentFilter treats a non-array classIds as
 * "do not scope by class" (the teacher's own view), so returning null on the
 * student path would silently unscope every query — the exact failure this
 * module exists to prevent. A student in no classes gets [], which still
 * matches teacher-wide resources and nothing else.
 *
 * `user.teacherId` is folded in rather than replaced. It is lossy, but it is
 * not wrong — a student assigned to a teacher directly (Clever roster, admin
 * assignment) may have no EnrollmentCode at all, and dropping it would strip
 * those students of every resource they can currently see.
 *
 * @param {Object} user  the student (needs _id and teacherId)
 * @returns {Promise<{teacherIds: Array, classIds: Array}>}
 */
async function getStudentScope(user) {
    if (!user || !user._id) return { teacherIds: [], classIds: [] };

    const codes = await EnrollmentCode.find({
        'enrolledStudents.studentId': user._id
    }).select('_id teacherId').lean();

    const classIds = codes.map(c => c._id);

    // De-duplicate by string — the same teacher across two classes is one
    // teacher, and ObjectIds do not dedupe by identity in a Set.
    const seen = new Set();
    const teacherIds = [];
    for (const id of [user.teacherId, ...codes.map(c => c.teacherId)]) {
        if (!id) continue;
        const key = String(id);
        if (seen.has(key)) continue;
        seen.add(key);
        teacherIds.push(id);
    }

    return { teacherIds, classIds };
}

/**
 * The enrollment-code ids a student is enrolled in.
 * Thin wrapper kept for callers that only need the class half.
 *
 * @param {ObjectId|string} studentId
 * @returns {Promise<Array<ObjectId>>}
 */
async function getStudentClassIds(studentId) {
    if (!studentId) return [];
    const codes = await EnrollmentCode.find({
        'enrolledStudents.studentId': studentId
    }).select('_id').lean();
    return codes.map(c => c._id);
}

/**
 * Can this student see this already-loaded resource?
 *
 * The in-memory twin of visibleToStudentFilter, for the download endpoint,
 * which fetches by id first and authorizes second. Kept next to the query
 * builder so the two rules are read and changed together.
 *
 * @param {Object} resource        a TeacherResource document
 * @param {Object} scope           { teacherIds, classIds } from getStudentScope()
 */
function resourceVisibleToStudent(resource, scope) {
    if (!resource || resource.isPublished === false) return false;

    // `|| []` rather than destructuring defaults: a default only fires for
    // undefined, so an explicit null — which is exactly what a caller that
    // forgot to await would hand us — would sail through and throw on .map.
    // The failure mode here must be "sees less", never a 500 or a wildcard.
    const teacherIds = (scope && scope.teacherIds) || [];
    const classIds = (scope && scope.classIds) || [];

    // The resource has to belong to one of the student's teachers at all.
    const mineTeachers = new Set(teacherIds.map(String));
    if (!mineTeachers.has(String(resource.teacherId))) return false;

    const targets = resource.sharedWithClassIds || [];
    if (targets.length === 0) return true; // teacher-wide

    const mineClasses = new Set(classIds.map(String));
    return targets.some(id => mineClasses.has(String(id)));
}

module.exports = { getStudentScope, getStudentClassIds, resourceVisibleToStudent };
