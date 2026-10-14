// routes/teacherTestPrep.js — practice-test results (PreACT / PSAT / SAT / ACT)
// for a teacher's CURRENT students. Mounted at /api/teacher/test-prep behind
// isTeacher (config/routes.js).
//
// Students take practice tests in the logged-in runner (or claim guest
// attempts into their account); until now nothing on the teacher side read
// any of it. Scoping is the roster rule (getStudentIdsForTeacher, scope
// 'current' — archived students excluded), every read is FERPA-logged per
// student whose results were returned, and the numbers come from
// utils/testPrepScores.js so they match what the student's own report says.

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = require('../models/user');
const EnrollmentCode = require('../models/enrollmentCode');
const { getStudentIdsForTeacher } = require('../services/userService');
const { anyRole } = require('../utils/roleQuery');
const { logRecordAccess } = require('../middleware/ferpaAccessLog');
const { currentSchoolYear, classSchoolYear } = require('../utils/schoolYear');
const PracticeTestAssignment = require('../models/practiceTestAssignment');
const ActTestSession = require('../models/actTestSession');
const {
  EXAM_ORDER, KNOWN_EXAMS, examMeta, buildStudentExams, buildClassSummary, loadTestScores,
  RUNNER_URL, assignmentStatus,
} = require('../utils/testPrepScores');

const logRead = (action) => logRecordAccess('assessment_results', 'teaching_instruction', {
  getStudentIds: (req) => req.accessedStudentIds,
  accessType: action, // 'api_read' for the tab, 'export' for the CSV
});

function parseDate(v, endOfDay) {
  if (!v || typeof v !== 'string') return null;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T${endOfDay ? '23:59:59' : '00:00:00'}` : v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Resolve the request to a student list + the filters, enforcing ownership. */
async function resolveScope(req) {
  const teacherId = req.user._id;
  const exam = KNOWN_EXAMS.includes(req.query.exam) ? req.query.exam : null;
  const from = parseDate(req.query.from, false);
  const to = parseDate(req.query.to, true);
  let ids = await getStudentIdsForTeacher(teacherId, { scope: req.query.scope === 'all' ? 'all' : 'current' });

  const classes = await EnrollmentCode.find({ teacherId }, 'className period schoolYear createdAt enrolledStudents').lean();
  const classById = new Map(classes.map(c => [String(c._id), c]));
  let classId = null;
  if (req.query.classId) {
    if (!mongoose.Types.ObjectId.isValid(String(req.query.classId)) || !classById.has(String(req.query.classId))) {
      const err = new Error('Class not found.');
      err.status = 404;
      throw err;
    }
    classId = String(req.query.classId);
    const members = new Set((classById.get(classId).enrolledStudents || []).map(e => String(e.studentId)));
    ids = ids.filter(id => members.has(id));
  }
  const thisYear = currentSchoolYear();
  const classNamesByStudent = new Map();
  for (const c of classes) {
    if (classSchoolYear(c) !== thisYear) continue;
    for (const e of c.enrolledStudents || []) {
      const k = String(e.studentId);
      if (!classNamesByStudent.has(k)) classNamesByStudent.set(k, []);
      classNamesByStudent.get(k).push(c.className + (c.period ? ` · ${c.period}` : ''));
    }
  }
  return {
    ids, exam, from, to, classId,
    classes: classes.filter(c => classSchoolYear(c) === thisYear)
      .map(c => ({ _id: c._id, className: c.className, period: c.period || null, studentCount: (c.enrolledStudents || []).length })),
    classNamesByStudent,
  };
}

async function buildPayload(req) {
  const scope = await resolveScope(req);
  const [users, scoresByStudent] = await Promise.all([
    User.find({ _id: { $in: scope.ids }, ...anyRole('student') }, 'firstName lastName username gradeLevel').lean(),
    loadTestScores(scope.ids, { from: scope.from, to: scope.to, exam: scope.exam }),
  ]);
  const students = users.map(u => {
    const attempts = scoresByStudent.get(String(u._id)) || [];
    return {
      _id: u._id,
      name: `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.username || 'Student',
      gradeLevel: u.gradeLevel || null,
      classes: scope.classNamesByStudent.get(String(u._id)) || [],
      exams: buildStudentExams(attempts),
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
  const examsShown = scope.exam ? [scope.exam] : EXAM_ORDER;
  return {
    scope,
    students,
    summaries: examsShown.map(t => buildClassSummary(students, t)),
  };
}

/**
 * GET /api/teacher/test-prep/scores?exam=&classId=&from=&to=
 * Everything the Test Prep tab draws, in one response.
 */
router.get('/scores', logRead('api_read'), async (req, res) => {
  try {
    const { scope, students, summaries } = await buildPayload(req);
    req.accessedStudentIds = students.filter(s => Object.keys(s.exams).length).map(s => s._id);
    res.json({
      success: true,
      exams: (scope.exam ? [scope.exam] : EXAM_ORDER).map(examMeta),
      summaries,
      classes: scope.classes,
      filters: { exam: scope.exam, classId: scope.classId, from: scope.from, to: scope.to },
      students,
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, message: err.message });
    console.error('[test-prep] scores failed:', err);
    res.status(500).json({ success: false, message: 'Could not load practice-test scores.' });
  }
});

function csvCell(v) {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * GET /api/teacher/test-prep/export.csv — one row per attempt, same filters.
 */
router.get('/export.csv', logRead('export'), async (req, res) => {
  try {
    const { students } = await buildPayload(req);
    const header = ['Student', 'Grade', 'Classes', 'Test', 'Completed', 'Scaled score', 'Likely range', 'Raw', 'Questions', 'Answered',
      'Minutes used', 'Time limit', 'Route', 'Flags', 'Counts toward class average'];
    const rows = [header];
    const withScores = [];
    for (const s of students) {
      const exams = Object.values(s.exams);
      if (exams.length) withScores.push(s._id);
      for (const e of exams) {
        for (const a of e.attempts) {
          rows.push([
            s.name, s.gradeLevel || '', s.classes.join('; '), examMeta(a.testId).label,
            a.completedAt ? new Date(a.completedAt).toISOString().slice(0, 10) : '',
            a.scaledScore ?? '', a.range ? `${a.range.low}-${a.range.high}` : '', a.rawScore ?? '', a.totalItems, a.answered,
            a.durationMinutes ?? '', a.timeLimitMinutes ?? '', a.moduleRoute || '', a.flags.join(' '),
            a.countsTowardAverage ? 'yes' : 'no',
          ]);
        }
      }
    }
    req.accessedStudentIds = withScores;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="practice-test-scores-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send('﻿' + rows.map(r => r.map(csvCell).join(',')).join('\r\n'));
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, message: err.message });
    console.error('[test-prep] export failed:', err);
    res.status(500).json({ success: false, message: 'Could not export practice-test scores.' });
  }
});

// ── Assigning a practice test to a class ────────────────────────────────

/**
 * GET /api/teacher/test-prep/assignments
 * My assigned practice tests, each with every current student in the class
 * marked done / in-progress / not-started (derived from their sessions).
 */
router.get('/assignments', logRead('api_read'), async (req, res) => {
  try {
    const teacherId = req.user._id;
    const [assignments, roster] = await Promise.all([
      PracticeTestAssignment.find({ teacherId }).sort({ assignedAt: -1 }).lean(),
      getStudentIdsForTeacher(teacherId, { scope: 'current' }),
    ]);
    if (!assignments.length) return res.json({ success: true, assignments: [] });
    const current = new Set(roster);
    const classes = await EnrollmentCode.find({ _id: { $in: assignments.map(a => a.classId) }, teacherId }, 'className period enrolledStudents').lean();
    const classById = new Map(classes.map(c => [String(c._id), c]));
    const studentIds = [...new Set(classes.flatMap(c => (c.enrolledStudents || []).map(e => String(e.studentId))))].filter(id => current.has(id));
    const [users, sessions] = await Promise.all([
      User.find({ _id: { $in: studentIds }, ...anyRole('student') }, 'firstName lastName username').lean(),
      ActTestSession.find(
        { userId: { $in: studentIds }, status: { $in: ['completed', 'in_progress'] }, startedAt: { $gte: new Date(Math.min(...assignments.map(a => new Date(a.assignedAt).getTime()))) } },
        'userId testId status startedAt completedAt scaledScore'
      ).lean(),
    ]);
    const nameById = new Map(users.map(u => [String(u._id), `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.username]));
    const sessionsBy = new Map();
    for (const s of sessions) {
      const k = `${s.userId}|${s.testId || 'act-math'}`;
      if (!sessionsBy.has(k)) sessionsBy.set(k, []);
      sessionsBy.get(k).push(s);
    }
    const out = assignments.map(a => {
      const cls = classById.get(String(a.classId));
      const members = cls ? (cls.enrolledStudents || []).map(e => String(e.studentId)).filter(id => nameById.has(id)) : [];
      const students = members.map(id => ({
        _id: id,
        name: nameById.get(id),
        ...assignmentStatus(sessionsBy.get(`${id}|${a.testId}`), a.assignedAt),
      })).sort((x, y) => x.name.localeCompare(y.name));
      const counts = { done: 0, 'in-progress': 0, 'not-started': 0 };
      students.forEach(st => { counts[st.status] += 1; });
      return {
        _id: a._id,
        ...examMeta(a.testId),
        classId: a.classId,
        className: cls ? cls.className + (cls.period ? ` · ${cls.period}` : '') : '(deleted class)',
        dueDate: a.dueDate,
        note: a.note,
        assignedAt: a.assignedAt,
        counts,
        students,
      };
    });
    req.accessedStudentIds = studentIds;
    res.json({ success: true, assignments: out });
  } catch (err) {
    console.error('[test-prep] list assignments failed:', err);
    res.status(500).json({ success: false, message: 'Could not load assigned practice tests.' });
  }
});

/** POST /api/teacher/test-prep/assignments { testId, classId, dueDate?, note? } */
router.post('/assignments', async (req, res) => {
  try {
    const { testId, classId, dueDate, note } = req.body || {};
    if (!KNOWN_EXAMS.includes(testId)) return res.status(400).json({ success: false, message: 'Pick a test.' });
    if (!mongoose.Types.ObjectId.isValid(String(classId))) return res.status(400).json({ success: false, message: 'Pick a class.' });
    const cls = await EnrollmentCode.findOne({ _id: classId, teacherId: req.user._id }, '_id className').lean();
    if (!cls) return res.status(404).json({ success: false, message: 'Class not found.' });
    let due = null;
    if (dueDate) {
      due = parseDate(dueDate, true);
      if (!due) return res.status(400).json({ success: false, message: 'Invalid due date.' });
    }
    const cleanNote = typeof note === 'string' ? note.trim().slice(0, 500) : '';
    // Re-assigning the same test to the same class starts a fresh window.
    const assignment = await PracticeTestAssignment.findOneAndUpdate(
      { classId: cls._id, testId },
      { $set: { teacherId: req.user._id, dueDate: due, note: cleanNote, assignedAt: new Date() } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.status(201).json({ success: true, assignment: { ...assignment.toObject(), ...examMeta(testId), className: cls.className } });
  } catch (err) {
    console.error('[test-prep] assign failed:', err);
    res.status(500).json({ success: false, message: 'Could not assign the practice test.' });
  }
});

/** DELETE /api/teacher/test-prep/assignments/:id — attempts are kept. */
router.delete('/assignments/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid id.' });
    const r = await PracticeTestAssignment.deleteOne({ _id: req.params.id, teacherId: req.user._id });
    if (!r.deletedCount) return res.status(404).json({ success: false, message: 'Assignment not found.' });
    res.json({ success: true });
  } catch (err) {
    console.error('[test-prep] unassign failed:', err);
    res.status(500).json({ success: false, message: 'Could not remove the assignment.' });
  }
});

module.exports = router;
module.exports.RUNNER_URL = RUNNER_URL;
