// routes/teacherRoster.js — school-year rollover for a teacher's roster.
//
// Mounted at /api/teacher/roster behind isTeacher (config/routes.js).
//
// The problem it solves: a teacher's links to students never end, so every
// August the dashboard is last year's class plus this year's. On prod, a
// 105-student roster had ~90 students from the previous year driving false
// "needs help"/"inactive" alerts, announcement recipients and averages.
//
// Archiving is a VIEW change, never a data change: the student keeps their
// account, history and teacher link; the teacher's current-year aggregates
// stop counting them (getStudentIdsForTeacher scope 'current'), and the past
// year stays readable. Restore is always one call — no 7-day window to miss.

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = require('../models/user');
const EnrollmentCode = require('../models/enrollmentCode');
const { getStudentIdsForTeacher } = require('../services/userService');
const { anyRole } = require('../utils/roleQuery');
const { buildActivityIndex, resolveLastActiveAt } = require('../utils/studentActivity');
const {
  currentSchoolYear, previousSchoolYear, schoolYearOf, currentYearStart,
  isNewYearPromptSeason, classSchoolYear,
} = require('../utils/schoolYear');

const MAX_BATCH = 500;

function displayName(s) {
  return `${s.firstName || ''} ${s.lastName || ''}`.trim() || s.username || 'Student';
}

/** Students on the CURRENT roster with their real last-active time. */
async function currentRosterWithActivity(teacherId, now = Date.now()) {
  const ids = await getStudentIdsForTeacher(teacherId, { scope: 'current' });
  if (ids.length === 0) return [];
  const students = await User.find(
    { _id: { $in: ids }, ...anyRole('student') },
    'firstName lastName username gradeLevel lastLogin createdAt'
  ).lean();
  const index = await buildActivityIndex(students.map(s => s._id), { now });
  return students.map(s => {
    const entry = index.get(String(s._id));
    const lastActiveAt = resolveLastActiveAt(s, entry && entry.lastActivity);
    return { _id: s._id, name: displayName(s), gradeLevel: s.gradeLevel || null, createdAt: s.createdAt, lastActiveAt };
  });
}

/**
 * Who would roll off: on the current roster, no activity since the cutoff,
 * and the account itself predates the cutoff (a brand-new student who simply
 * hasn't started yet is THIS year's, not last year's).
 */
function selectArchiveCandidates(roster, cutoff) {
  const c = new Date(cutoff).getTime();
  return roster.filter(s => {
    const created = s.createdAt ? new Date(s.createdAt).getTime() : 0;
    if (created >= c) return false;
    const last = s.lastActiveAt ? new Date(s.lastActiveAt).getTime() : 0;
    return last < c;
  });
}

function parseCutoff(raw, now) {
  if (raw) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return currentYearStart(now);
}

function cleanIds(list) {
  if (!Array.isArray(list)) return [];
  return [...new Set(list.map(String))].filter(id => mongoose.Types.ObjectId.isValid(id)).slice(0, MAX_BATCH);
}

/**
 * GET /api/teacher/roster/year
 * Everything the year switcher and the "start a new year" wizard need.
 */
router.get('/year', async (req, res) => {
  try {
    const now = new Date();
    const teacherId = req.user._id;
    const [roster, archivedIds, classes] = await Promise.all([
      currentRosterWithActivity(teacherId, now.getTime()),
      getStudentIdsForTeacher(teacherId, { scope: 'archived' }),
      EnrollmentCode.find({ teacherId }, 'className schoolYear period gradeLevel mathCourse code isActive createdAt enrolledStudents').lean(),
    ]);
    const cutoff = currentYearStart(now);
    const candidates = selectArchiveCandidates(roster, cutoff);
    const thisYear = currentSchoolYear(now);
    const classSummaries = classes.map(c => ({
      _id: c._id,
      className: c.className,
      schoolYear: classSchoolYear(c),
      period: c.period || null,
      gradeLevel: c.gradeLevel || null,
      mathCourse: c.mathCourse || null,
      code: c.code,
      isActive: c.isActive !== false,
      studentCount: (c.enrolledStudents || []).length,
    }));
    const hasCurrentYearClass = classSummaries.some(c => c.schoolYear === thisYear);
    const years = [...new Set([thisYear, ...classSummaries.map(c => c.schoolYear)])].sort().reverse();

    res.json({
      success: true,
      currentYear: thisYear,
      previousYear: previousSchoolYear(now),
      currentYearStartsAt: cutoff,
      years,
      counts: { current: roster.length, archived: archivedIds.length, lastYearCandidates: candidates.length },
      hasCurrentYearClass,
      // Nudge only when it would actually help: new-year season, no class
      // set up for this year, and last year's students still on the roster.
      promptNewYear: isNewYearPromptSeason(now) && !hasCurrentYearClass && candidates.length > 0,
      classes: classSummaries,
    });
  } catch (err) {
    console.error('[roster] year summary failed:', err);
    res.status(500).json({ success: false, message: 'Could not load school-year info.' });
  }
});

/**
 * GET /api/teacher/roster/archive-candidates?before=2026-07-01
 * Preview before archiving: who has not been active since the cutoff.
 */
router.get('/archive-candidates', async (req, res) => {
  try {
    const now = new Date();
    const cutoff = parseCutoff(req.query.before, now);
    const roster = await currentRosterWithActivity(req.user._id, now.getTime());
    const candidates = selectArchiveCandidates(roster, cutoff)
      .sort((a, b) => a.name.localeCompare(b.name));
    res.json({
      success: true,
      cutoff,
      schoolYear: schoolYearOf(new Date(cutoff.getTime() - 1)),
      students: candidates,
      keep: roster.length - candidates.length,
    });
  } catch (err) {
    console.error('[roster] archive candidates failed:', err);
    res.status(500).json({ success: false, message: 'Could not load students to archive.' });
  }
});

/**
 * POST /api/teacher/roster/archive  { studentIds: [...] }
 * Only students on this teacher's current roster can be archived.
 */
router.post('/archive', async (req, res) => {
  try {
    const teacherId = req.user._id;
    const requested = cleanIds(req.body && req.body.studentIds);
    if (requested.length === 0) return res.status(400).json({ success: false, message: 'Choose at least one student.' });

    const current = new Set(await getStudentIdsForTeacher(teacherId, { scope: 'current' }));
    const ids = requested.filter(id => current.has(id));
    if (ids.length === 0) return res.status(404).json({ success: false, message: 'None of those students are on your current roster.' });

    // Label each archive with the year the student was last active in, so the
    // past-year view groups them where a teacher would look for them.
    const students = await User.find({ _id: { $in: ids } }, 'lastLogin').lean();
    const index = await buildActivityIndex(ids);
    const now = new Date();
    const entries = students.map(s => {
      const entry = index.get(String(s._id));
      const last = resolveLastActiveAt(s, entry && entry.lastActivity);
      return { studentId: s._id, archivedAt: now, schoolYear: schoolYearOf(last || new Date(now.getTime() - 1)) };
    });

    await User.updateOne(
      { _id: teacherId },
      { $push: { archivedStudents: { $each: entries } } }
    );
    res.json({ success: true, archived: entries.length, skipped: requested.length - entries.length });
  } catch (err) {
    console.error('[roster] archive failed:', err);
    res.status(500).json({ success: false, message: 'Could not archive those students.' });
  }
});

/**
 * POST /api/teacher/roster/restore  { studentIds: [...] }  (or { all: true })
 */
router.post('/restore', async (req, res) => {
  try {
    const teacherId = req.user._id;
    const all = req.body && req.body.all === true;
    const ids = cleanIds(req.body && req.body.studentIds);
    if (!all && ids.length === 0) return res.status(400).json({ success: false, message: 'Choose at least one student.' });

    const pull = all ? {} : { studentId: { $in: ids.map(id => new mongoose.Types.ObjectId(id)) } };
    const before = await User.findById(teacherId, 'archivedStudents').lean();
    await User.updateOne({ _id: teacherId }, { $pull: { archivedStudents: pull } });
    const after = await User.findById(teacherId, 'archivedStudents').lean();
    const restored = ((before && before.archivedStudents) || []).length - ((after && after.archivedStudents) || []).length;
    res.json({ success: true, restored });
  } catch (err) {
    console.error('[roster] restore failed:', err);
    res.status(500).json({ success: false, message: 'Could not restore those students.' });
  }
});

module.exports = router;
module.exports.selectArchiveCandidates = selectArchiveCandidates;
