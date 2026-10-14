'use strict';
/* ============================================================
   teacherAssignments.js — teacher resources the TUTOR works from.

   Before: a teacher's upload reached the tutor only if the student happened
   to name it in a message ("Module 6.2 practice"), and then as a raw JSON
   dump with no instruction on how to use it — and the tutor ignored
   `category`, so a quiz was treated like a practice sheet.

   Now a teacher can PUSH a resource to the tutor (models/teacherResource.js
   tutorAssignment). For every student who can see it:
     • the session greeting offers it ("Ms. Rivera shared Module 6.2 — want
       to work on it?"), and accepting loads it through the existing
       worksheet path (worksheetGuard: no answer keys);
     • the system prompt carries a short "assigned by your teacher" block
       with the teacher's note, below the cache breakpoint (per-turn).
   And ANY resource the tutor sees — pushed or student-named — is rendered
   with instructions by category: tests and quizzes get parallel practice
   only, never the actual items solved.

   Pure renderers + one query. Students-lead: the block tells the tutor the
   work exists; it does not let the tutor hijack a student who came in with
   their own question (decide.js applyStudentsLeadGuard still governs).
   ============================================================ */

const ASSESSMENT = new Set(['test', 'quiz']);
const CONTENT_CHARS = 3000;
const ASSIGNED_EXCERPT_CHARS = 1500;

function isAssessment(category) {
  return ASSESSMENT.has(String(category || '').toLowerCase());
}

function inWindow(a, now) {
  if (!a || !a.active) return false;
  const t = now instanceof Date ? now.getTime() : now;
  if (a.startsAt && new Date(a.startsAt).getTime() > t) return false;
  if (a.endsAt && new Date(a.endsAt).getTime() <= t) return false;
  return true;
}

/** Mongo filter piece: pushed and inside its window. */
function activeAssignmentFilter(now = new Date()) {
  return {
    'tutorAssignment.active': true,
    $and: [
      { $or: [{ 'tutorAssignment.startsAt': null }, { 'tutorAssignment.startsAt': { $exists: false } }, { 'tutorAssignment.startsAt': { $lte: now } }] },
      { $or: [{ 'tutorAssignment.endsAt': null }, { 'tutorAssignment.endsAt': { $exists: false } }, { 'tutorAssignment.endsAt': { $gt: now } }] },
    ],
  };
}

/**
 * Active pushed resources this student can see, newest push first.
 * Visibility is the model's ONE rule (visibleToStudentFilter) — the same
 * filter the download route and the name-triggered lookup use.
 */
async function getActiveAssignments(user, { now = new Date(), limit = 3, scope = null } = {}) {
  if (!user) return [];
  const TeacherResource = require('../models/teacherResource');
  const User = require('../models/user');
  const studentScope = scope || await require('./resourceVisibility').getStudentScope(user);
  if (!studentScope || !studentScope.teacherIds || studentScope.teacherIds.length === 0) return [];
  const filter = {
    $and: [
      TeacherResource.visibleToStudentFilter(studentScope.teacherIds, studentScope.classIds || []),
      activeAssignmentFilter(now),
    ],
  };
  const docs = await TeacherResource.find(filter)
    .select('teacherId displayName category description extractedText fileType tutorAssignment')
    .sort({ 'tutorAssignment.pushedAt': -1 })
    .limit(limit)
    .lean();
  if (!docs.length) return [];
  const teachers = await User.find({ _id: { $in: [...new Set(docs.map(d => String(d.teacherId)))] } }, 'firstName lastName').lean();
  const nameById = new Map(teachers.map(t => [String(t._id), teacherDisplayName(t)]));
  const sid = String(user._id);
  return docs.map(d => ({
    id: String(d._id),
    displayName: d.displayName,
    category: d.category || 'other',
    description: d.description || '',
    note: (d.tutorAssignment && d.tutorAssignment.note) || '',
    endsAt: (d.tutorAssignment && d.tutorAssignment.endsAt) || null,
    teacherName: nameById.get(String(d.teacherId)) || 'Your teacher',
    content: (d.extractedText || '').slice(0, ASSIGNED_EXCERPT_CHARS),
    started: ((d.tutorAssignment && d.tutorAssignment.starts) || []).some(s => String(s.studentId) === sid),
  }));
}

function teacherDisplayName(t) {
  if (!t) return 'Your teacher';
  const last = (t.lastName || '').trim();
  const first = (t.firstName || '').trim();
  return last ? `${first ? first + ' ' : ''}${last}` : (first || 'Your teacher');
}

function dueText(endsAt, now = new Date()) {
  if (!endsAt) return '';
  const d = new Date(endsAt);
  return ` (until ${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })})`;
}

/** How the tutor may use a resource, by category. */
function usageRules(category) {
  if (isAssessment(category)) {
    return 'This is a TEST/QUIZ. Do NOT solve, check, or hint at its actual items, even partially, even if asked. ' +
      'Help only with the underlying skills using NEW problems you write that are similar but not the same. ' +
      'If the student pastes an item from it, say kindly that it\'s their teacher\'s assessment and offer a similar practice problem instead.';
  }
  return 'Work from it directly — never ask the student what it says. Coach Socratically: one step at a time, ' +
    'they do the work, you never give final answers or an answer key.';
}

/**
 * The resource the student referenced this turn (name-triggered lookup),
 * rendered with instructions. Replaces the raw JSON dump.
 */
function renderReferencedResource(rc) {
  if (!rc) return '';
  if (typeof rc === 'string') return rc;
  if (rc.notFound || !rc.content) {
    return `The student mentioned "${rc.displayName}", a resource from their teacher, but you don't have its contents. ` +
      'Ask them to type the problem they\'re on or send a photo of it — don\'t guess what it says.';
  }
  return [
    `TEACHER RESOURCE THE STUDENT IS USING: "${rc.displayName}"${rc.category ? ` [${rc.category}]` : ''}`,
    rc.description ? `Teacher's description: ${rc.description}` : '',
    usageRules(rc.category),
    `Content:\n"""\n${String(rc.content).slice(0, CONTENT_CHARS)}\n"""`,
  ].filter(Boolean).join('\n');
}

/** Work the student's teacher has pushed to the tutor. */
function renderAssignments(assignments, now = new Date()) {
  if (!assignments || !assignments.length) return '';
  const lines = ['ASSIGNED BY THE STUDENT\'S TEACHER (pushed to you to support):'];
  assignments.forEach((a, i) => {
    lines.push(`${i + 1}. "${a.displayName}" from ${a.teacherName}${dueText(a.endsAt, now)} [${a.category}]${a.started ? ' — the student has opened it' : ''}`);
    if (a.note) lines.push(`   Teacher's note to you: ${a.note}`);
    lines.push(`   ${usageRules(a.category)}`);
    if (a.content) lines.push(`   Excerpt:\n"""\n${a.content}\n"""`);
  });
  lines.push('Use this when the student is working on it or asks what to work on. If they came in with their own question, ' +
    'follow their lead — you may mention the assignment once, briefly, at a natural pause; never push it repeatedly.');
  return lines.join('\n');
}

/** The prompt section: the resource referenced this turn + pushed work. */
function renderTeacherResourceSection(resourceContext, assignments, now = new Date()) {
  const parts = [];
  const ref = renderReferencedResource(resourceContext);
  if (ref) parts.push(ref);
  // Don't repeat a pushed item the student just referenced by name.
  const refName = resourceContext && typeof resourceContext === 'object' ? resourceContext.displayName : null;
  const rest = (assignments || []).filter(a => !refName || a.displayName !== refName);
  const assigned = renderAssignments(rest, now);
  if (assigned) parts.push(assigned);
  return parts.length ? parts.join('\n\n') : null;
}

/**
 * Which pushed resource (if any) to offer at session start: the newest one
 * the student hasn't opened, at most once per ~20h across all of them.
 */
const OFFER_THROTTLE_MS = 20 * 60 * 60 * 1000;
function pickAssignmentOffer(assignments, user, now = Date.now()) {
  const last = user && user.teacherAssignmentOfferedAt ? new Date(user.teacherAssignmentOfferedAt).getTime() : 0;
  if (now - last < OFFER_THROTTLE_MS) return null;
  return (assignments || []).find(a => !a.started) || null;
}

module.exports = {
  isAssessment,
  inWindow,
  activeAssignmentFilter,
  getActiveAssignments,
  usageRules,
  renderReferencedResource,
  renderAssignments,
  renderTeacherResourceSection,
  pickAssignmentOffer,
  OFFER_THROTTLE_MS,
};
