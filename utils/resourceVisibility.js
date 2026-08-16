// utils/resourceVisibility.js
// Which classes a student belongs to, for scoping teacher-shared resources.
//
// A "class" in this codebase is an EnrollmentCode document: it carries the
// className and an enrolledStudents[] list. A teacher can share an uploaded
// resource with specific classes (teacherResource.sharedWithClassIds), and
// every student-facing read of a resource has to be filtered against the
// classes that student is actually in.
//
// This lives in its own module rather than inside a route because THREE
// call sites need the same answer — the resources list, the download
// endpoint, and the AI tutor's resource lookup in routes/chat.js — and the
// third is the one that leaks quietly if it disagrees with the other two.

const EnrollmentCode = require('../models/enrollmentCode');

/**
 * The enrollment-code ids a student is enrolled in.
 *
 * Always returns an ARRAY, never null. That matters: the model's
 * visibleToStudentFilter treats a non-array as "do not scope by class"
 * (the teacher's own view), so returning null on the student path would
 * silently unscope every query — the exact failure this module exists to
 * prevent. A student in no classes gets [], which still matches
 * teacher-wide resources and nothing else.
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
 * @param {Object} resource      a TeacherResource document
 * @param {Array} studentClassIds  from getStudentClassIds()
 */
function resourceVisibleToStudent(resource, studentClassIds) {
    if (!resource || resource.isPublished === false) return false;
    const targets = resource.sharedWithClassIds || [];
    if (targets.length === 0) return true; // teacher-wide
    const mine = new Set((studentClassIds || []).map(String));
    return targets.some(id => mine.has(String(id)));
}

module.exports = { getStudentClassIds, resourceVisibleToStudent };
