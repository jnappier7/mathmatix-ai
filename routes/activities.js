/**
 * routes/activities.js — Class Activities: hand-built interactive pages a
 * teacher assigns to a class, with per-student results.
 *
 * Mounted at /api/activities behind isAuthenticated (config/routes.js).
 *
 *   Student
 *     GET  /mine                     assignments for the classes I'm enrolled in
 *     GET  /:slug/frame              the activity HTML, served into a sandbox
 *     GET  /:slug/progress           my solved levels per item (restores ✓ marks)
 *     POST /:slug/events             one Check from the activity (via the host page)
 *   Teacher
 *     GET    /catalog                every published activity
 *     GET    /assignments            my assignments, with class names
 *     POST   /assignments            assign an activity to one of my classes
 *     DELETE /assignments/:id        unassign (results are kept)
 *     GET    /assignments/:id/results  roster × items, plus the class trap report
 *
 * Security model (docs/CLASS_ACTIVITIES.md): the frame is served with a CSP
 * `sandbox allow-scripts` directive, so even opened directly in a tab it runs
 * in an opaque origin — no cookies, no session, no same-origin API access —
 * and `connect-src 'none'` means it cannot phone anywhere. It talks only to
 * its host page (public/js/activities.js) by postMessage; the host posts the
 * result here, and identity comes from the session. The activity can lie about
 * how it did, but never about who did it or which activity/item/level it was.
 */

const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const { isTeacher } = require('../middleware/auth');
const { logRecordAccess } = require('../middleware/ferpaAccessLog');
const EnrollmentCode = require('../models/enrollmentCode');
const User = require('../models/user');
const ActivityAssignment = require('../models/activityAssignment');
const ActivityAttempt = require('../models/activityAttempt');
const { listActivities, getActivity, getActivityHtml, toPublic } = require('../utils/activityRegistry');
const { anyRole, userHasRole } = require('../utils/roleQuery');
const logger = require('../utils/logger');

// Per-student, per-activity ceiling on stored events. A real student on a
// five-proof activity uses a few dozen; this only stops a runaway loop.
const MAX_EVENTS_PER_ACTIVITY = 2000;
// Don't write a fresh 'open' for every reload.
const OPEN_DEDUPE_MS = 10 * 60 * 1000;

const FRAME_CSP = [
  'sandbox allow-scripts',
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com',
  'img-src data: blob:',
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "frame-ancestors 'self'"
].join('; ');

const isObjectId = (v) => typeof v === 'string' && mongoose.Types.ObjectId.isValid(v);

/** Class ids (EnrollmentCode) the user is enrolled in. */
async function enrolledClassIds(userId) {
  const codes = await EnrollmentCode.find({ 'enrolledStudents.studentId': userId }, '_id').lean();
  return codes.map((c) => c._id);
}

/** The assignments of `slug` that reach this student, or [] if none. */
async function assignmentsReachingStudent(userId, slug) {
  const classIds = await enrolledClassIds(userId);
  if (classIds.length === 0) return [];
  return ActivityAssignment.find({ classId: { $in: classIds }, activitySlug: slug }).lean();
}

const canPreview = (user) => userHasRole(user, 'teacher') || userHasRole(user, 'admin');

/** { itemKey: [levels solved, ascending] } from a list of check events. */
function solvedLevelsByItem(events) {
  const out = {};
  for (const e of events) {
    if (e.kind !== 'check' || !e.solved) continue;
    const set = out[e.itemKey] || (out[e.itemKey] = new Set());
    set.add(e.level);
  }
  return Object.fromEntries(Object.entries(out).map(([k, s]) => [k, [...s].sort((a, b) => a - b)]));
}

const clampInt = (v, min, max) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, Math.round(n)));
};

/**
 * Validate a check event against the manifest entry. Returns the document
 * fields to store, or { error }.
 */
function sanitizeCheckEvent(activity, body) {
  if (!body || body.type !== 'check') return { error: 'Unsupported event type' };
  const item = activity.items.find((i) => i.key === body.item);
  if (!item) return { error: 'Unknown item' };
  const level = activity.levels.find((l) => l.n === body.level);
  if (!level) return { error: 'Unknown level' };

  const total = clampInt(body.total, 1, 500);
  const correct = clampInt(body.correct, 0, 500);
  const checks = clampInt(body.checks, 1, 10000);
  if (total === null || correct === null || checks === null) return { error: 'Missing counts' };

  const misconceptions = (Array.isArray(body.misconceptions) ? body.misconceptions : [])
    .slice(0, 20)
    .filter((m) => m && typeof m.key === 'string' && m.key.trim())
    .map((m) => ({
      key: m.key.trim().slice(0, 32),
      label: typeof m.label === 'string' ? m.label.replace(/\s+/g, ' ').trim().slice(0, 200) : ''
    }));

  return {
    itemKey: item.key,
    level: level.n,
    total,
    correct: Math.min(correct, total),
    // "solved" must agree with the counts; a message can't claim a solve at 3 of 7.
    solved: body.solved === true && correct >= total,
    checks,
    durationMs: clampInt(body.durationMs, 0, 24 * 60 * 60 * 1000) ?? 0,
    misconceptions
  };
}

// ─────────────────────────────────────────────────────────────── Student ──

router.get('/mine', async (req, res) => {
  try {
    const classes = await EnrollmentCode.find(
      { 'enrolledStudents.studentId': req.user._id },
      '_id className teacherId'
    ).lean();
    if (classes.length === 0) return res.json({ success: true, assignments: [] });

    const classById = new Map(classes.map((c) => [String(c._id), c]));
    const assignments = await ActivityAssignment.find({ classId: { $in: classes.map((c) => c._id) } })
      .sort({ assignedAt: -1 })
      .lean();

    const slugs = [...new Set(assignments.map((a) => a.activitySlug))];
    const events = slugs.length
      ? await ActivityAttempt.find({ userId: req.user._id, activitySlug: { $in: slugs }, kind: 'check', solved: true })
        .select('activitySlug itemKey level kind solved').lean()
      : [];

    const seen = new Set();
    const out = [];
    for (const a of assignments) {
      const activity = getActivity(a.activitySlug);
      // An activity removed from the manifest just disappears from the list.
      if (!activity || seen.has(a.activitySlug)) continue;
      seen.add(a.activitySlug);
      const solved = solvedLevelsByItem(events.filter((e) => e.activitySlug === a.activitySlug));
      out.push({
        assignmentId: a._id,
        activity: toPublic(activity),
        className: classById.get(String(a.classId))?.className || '',
        dueDate: a.dueDate,
        note: a.note,
        assignedAt: a.assignedAt,
        itemsSolved: Object.keys(solved).length,
        itemsTotal: activity.items.length
      });
    }
    res.json({ success: true, assignments: out });
  } catch (err) {
    logger.error('[activities] /mine failed', { error: err.message });
    res.status(500).json({ success: false, message: 'Could not load your activities.' });
  }
});

router.get('/:slug/frame', async (req, res) => {
  try {
    const activity = getActivity(req.params.slug);
    if (!activity) return res.status(404).send('Activity not found');

    const assigned = (await assignmentsReachingStudent(req.user._id, activity.slug)).length > 0;
    if (!assigned && !canPreview(req.user)) return res.status(403).send('This activity has not been assigned to you.');

    if (assigned) {
      const recent = await ActivityAttempt.exists({
        userId: req.user._id, activitySlug: activity.slug, kind: 'open',
        createdAt: { $gte: new Date(Date.now() - OPEN_DEDUPE_MS) }
      });
      if (!recent) await ActivityAttempt.create({ userId: req.user._id, activitySlug: activity.slug, kind: 'open' });
    }

    // Replace helmet's page CSP wholesale with the sandbox policy, and allow
    // same-origin framing only (helmet's frameguard sends DENY, which would
    // block our own host page too).
    res.setHeader('Content-Security-Policy', FRAME_CSP);
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Cache-Control', 'private, no-cache');
    res.type('html').send(getActivityHtml(activity.slug));
  } catch (err) {
    logger.error('[activities] frame failed', { error: err.message, slug: req.params.slug });
    res.status(500).send('Could not load the activity.');
  }
});

router.get('/:slug/progress', async (req, res) => {
  try {
    const activity = getActivity(req.params.slug);
    if (!activity) return res.status(404).json({ success: false, message: 'Activity not found' });
    const events = await ActivityAttempt.find({
      userId: req.user._id, activitySlug: activity.slug, kind: 'check', solved: true
    }).select('itemKey level kind solved').lean();
    res.json({ success: true, activity: toPublic(activity), progress: solvedLevelsByItem(events) });
  } catch (err) {
    logger.error('[activities] progress failed', { error: err.message });
    res.status(500).json({ success: false, message: 'Could not load progress.' });
  }
});

router.post('/:slug/events', async (req, res) => {
  try {
    const activity = getActivity(req.params.slug);
    if (!activity) return res.status(404).json({ success: false, message: 'Activity not found' });

    const assigned = (await assignmentsReachingStudent(req.user._id, activity.slug)).length > 0;
    if (!assigned) {
      // A teacher previewing their own assignment: accept, store nothing.
      if (canPreview(req.user)) return res.json({ success: true, stored: false });
      return res.status(403).json({ success: false, message: 'This activity has not been assigned to you.' });
    }

    const fields = sanitizeCheckEvent(activity, req.body);
    if (fields.error) return res.status(400).json({ success: false, message: fields.error });

    const count = await ActivityAttempt.countDocuments({ userId: req.user._id, activitySlug: activity.slug });
    if (count >= MAX_EVENTS_PER_ACTIVITY) return res.status(429).json({ success: false, message: 'Too many attempts recorded.' });

    await ActivityAttempt.create({ userId: req.user._id, activitySlug: activity.slug, kind: 'check', ...fields });
    res.json({ success: true, stored: true });
  } catch (err) {
    logger.error('[activities] event failed', { error: err.message });
    res.status(500).json({ success: false, message: 'Could not save your result.' });
  }
});

// ─────────────────────────────────────────────────────────────── Teacher ──

router.get('/catalog', isTeacher, (req, res) => {
  res.json({ success: true, activities: listActivities() });
});

router.get('/assignments', isTeacher, async (req, res) => {
  try {
    const assignments = await ActivityAssignment.find({ teacherId: req.user._id }).sort({ assignedAt: -1 }).lean();
    const classes = await EnrollmentCode.find({ teacherId: req.user._id }, '_id className enrolledStudents').lean();
    const classById = new Map(classes.map((c) => [String(c._id), c]));
    res.json({
      success: true,
      assignments: assignments.map((a) => {
        const cls = classById.get(String(a.classId));
        const activity = getActivity(a.activitySlug);
        return {
          _id: a._id,
          activitySlug: a.activitySlug,
          activityTitle: activity ? activity.title : `${a.activitySlug} (retired)`,
          classId: a.classId,
          className: cls ? cls.className : '(deleted class)',
          studentCount: cls ? cls.enrolledStudents.length : 0,
          dueDate: a.dueDate,
          note: a.note,
          assignedAt: a.assignedAt
        };
      })
    });
  } catch (err) {
    logger.error('[activities] list assignments failed', { error: err.message });
    res.status(500).json({ success: false, message: 'Could not load assignments.' });
  }
});

router.post('/assignments', isTeacher, async (req, res) => {
  try {
    const { classId, activitySlug, dueDate, note } = req.body || {};
    const activity = getActivity(activitySlug);
    if (!activity) return res.status(400).json({ success: false, message: 'Unknown activity.' });
    if (!isObjectId(classId)) return res.status(400).json({ success: false, message: 'Pick a class.' });

    const cls = await EnrollmentCode.findOne({ _id: classId, teacherId: req.user._id }, '_id').lean();
    if (!cls) return res.status(404).json({ success: false, message: 'Class not found.' });

    let due = null;
    if (dueDate) {
      due = new Date(dueDate);
      if (Number.isNaN(due.getTime())) return res.status(400).json({ success: false, message: 'Invalid due date.' });
    }

    const assignment = await ActivityAssignment.create({
      teacherId: req.user._id,
      classId: cls._id,
      activitySlug: activity.slug,
      dueDate: due,
      note: typeof note === 'string' ? note.trim().slice(0, 500) : ''
    });
    res.status(201).json({ success: true, assignment });
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ success: false, message: 'That class already has this activity.' });
    }
    logger.error('[activities] assign failed', { error: err.message });
    res.status(500).json({ success: false, message: 'Could not assign the activity.' });
  }
});

router.delete('/assignments/:id', isTeacher, async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid id.' });
    const result = await ActivityAssignment.deleteOne({ _id: req.params.id, teacherId: req.user._id });
    if (result.deletedCount === 0) return res.status(404).json({ success: false, message: 'Assignment not found.' });
    res.json({ success: true });
  } catch (err) {
    logger.error('[activities] unassign failed', { error: err.message });
    res.status(500).json({ success: false, message: 'Could not remove the assignment.' });
  }
});

/**
 * Build the results report for one assignment. Exported for tests.
 * Events are scoped to the assignment window (assignedAt onward) so a
 * re-assignment later in the year starts clean without deleting history.
 */
function buildResults(activity, assignment, students, events) {
  const byStudent = new Map(students.map((s) => [String(s._id), { events: [] }]));
  for (const e of events) {
    const row = byStudent.get(String(e.userId));
    if (row) row.events.push(e);
  }

  const trapTally = {}; // itemKey -> key -> { label, students:Set }
  const rows = students.map((s) => {
    const evs = byStudent.get(String(s._id)).events;
    const items = {};
    let lastActivity = null;
    for (const e of evs) {
      if (!lastActivity || e.createdAt > lastActivity) lastActivity = e.createdAt;
      if (e.kind !== 'check') continue;
      const it = items[e.itemKey] || (items[e.itemKey] = { checks: 0, solvedLevels: [], firstSolve: null });
      it.checks += 1;
      if (e.solved) {
        if (!it.solvedLevels.includes(e.level)) it.solvedLevels.push(e.level);
        if (!it.firstSolve) it.firstSolve = { level: e.level, checks: e.checks, durationMs: e.durationMs, at: e.createdAt };
      }
      for (const m of e.misconceptions || []) {
        const perItem = trapTally[e.itemKey] || (trapTally[e.itemKey] = {});
        const t = perItem[m.key] || (perItem[m.key] = { label: m.label, students: new Set(), times: 0 });
        t.students.add(String(s._id));
        t.times += 1;
      }
    }
    for (const it of Object.values(items)) it.solvedLevels.sort((a, b) => a - b);
    const solvedCount = Object.values(items).filter((it) => it.solvedLevels.length > 0).length;
    return {
      studentId: s._id,
      name: [s.firstName, s.lastName].filter(Boolean).join(' ') || s.username || 'Student',
      opened: evs.length > 0,
      lastActivity,
      itemsSolved: solvedCount,
      items
    };
  });

  rows.sort((a, b) => a.name.localeCompare(b.name));

  const itemSummary = activity.items.map((item) => {
    const solvedBy = rows.filter((r) => r.items[item.key]?.solvedLevels.length).length;
    const traps = Object.entries(trapTally[item.key] || {})
      .map(([key, t]) => ({ key, label: t.label, students: t.students.size, times: t.times }))
      .sort((a, b) => b.students - a.students || b.times - a.times);
    return { key: item.key, label: item.label, solvedBy, traps };
  });

  return {
    activity: toPublic(activity),
    assignment: { _id: assignment._id, dueDate: assignment.dueDate, assignedAt: assignment.assignedAt },
    summary: {
      students: rows.length,
      opened: rows.filter((r) => r.opened).length,
      finishedAll: rows.filter((r) => r.itemsSolved === activity.items.length).length
    },
    items: itemSummary,
    students: rows
  };
}

router.get(
  '/assignments/:id/results',
  isTeacher,
  logRecordAccess('assessment_results', 'teaching_instruction', { getStudentIds: (req) => req.activityStudentIds }),
  async (req, res) => {
    try {
      if (!isObjectId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid id.' });
      const assignment = await ActivityAssignment.findOne({ _id: req.params.id, teacherId: req.user._id }).lean();
      if (!assignment) return res.status(404).json({ success: false, message: 'Assignment not found.' });
      const activity = getActivity(assignment.activitySlug);
      if (!activity) return res.status(410).json({ success: false, message: 'This activity has been retired.' });

      const cls = await EnrollmentCode.findOne({ _id: assignment.classId, teacherId: req.user._id }, 'className enrolledStudents').lean();
      const enrolledIds = cls ? cls.enrolledStudents.map((e) => e.studentId).filter(Boolean) : [];
      const students = enrolledIds.length
        ? await User.find({ _id: { $in: enrolledIds }, ...anyRole('student') }, 'firstName lastName username').lean()
        : [];
      const ids = students.map((s) => s._id);
      req.activityStudentIds = ids.map(String);

      const events = ids.length
        ? await ActivityAttempt.find({
          activitySlug: activity.slug, userId: { $in: ids }, createdAt: { $gte: assignment.assignedAt }
        }).sort({ createdAt: 1 }).lean()
        : [];

      res.json({ success: true, className: cls ? cls.className : '', ...buildResults(activity, assignment, students, events) });
    } catch (err) {
      logger.error('[activities] results failed', { error: err.message });
      res.status(500).json({ success: false, message: 'Could not load results.' });
    }
  }
);

module.exports = router;
module.exports._internal = { sanitizeCheckEvent, buildResults, solvedLevelsByItem, FRAME_CSP };
