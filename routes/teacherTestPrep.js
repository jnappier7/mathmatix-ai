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
const {
  EXAM_ORDER, KNOWN_EXAMS, examMeta, buildStudentExams, buildClassSummary, loadTestScores,
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

module.exports = router;
