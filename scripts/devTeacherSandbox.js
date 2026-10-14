#!/usr/bin/env node
// scripts/devTeacherSandbox.js
//
// A throwaway, in-memory MathMatix with a REALISTIC teacher roster, for
// working on the teacher dashboard in a real browser without touching prod.
//
//   node scripts/devTeacherSandbox.js            # → http://localhost:3077
//   SANDBOX_PORT=4000 node scripts/devTeacherSandbox.js
//
// Why it exists: the local .env points MONGO_URI at PRODUCTION Atlas, and the
// playground seed (seed:playground) is all shiny, recently-active demo kids —
// which is exactly the data shape that hid every dashboard bug fixed in the
// 2026-10 pass. Real rosters look like this one: a handful of students working
// this week, a couple stuck, a few lapsed, and a long tail of last year's
// accounts with stale counters and legacy 0-1 mastery seeds.
//
// Everything lives in mongodb-memory-server and vanishes on exit. MONGO_URI is
// overwritten BEFORE server.js loads, so the prod URI from .env never connects.
//
// Sign in (local accounts, sandbox only):
//   teacher  sandbox.teacher@mathmatix.test  /  sandbox-teacher-pass
//   teacher  empty.teacher@mathmatix.test    /  sandbox-teacher-pass   (no students — empty states)
//   student  sandbox.student@mathmatix.test  /  sandbox-teacher-pass   (sees the pushed worksheet)

const path = require('path');
const fs = require('fs');

const MAIN_ENV = [path.join(__dirname, '..', '.env'), path.join(__dirname, '..', '..', 'mathmatix-ai', '.env')]
  .find(p => fs.existsSync(p));
if (MAIN_ENV) require('dotenv').config({ path: MAIN_ENV, quiet: true });

const SANDBOX_PASSWORD = 'sandbox-teacher-pass';
const DAY = 24 * 60 * 60 * 1000;

const SKILLS = [
  ['one-step-equations', 'One-Step Equations'],
  ['two-step-equations', 'Two-Step Equations'],
  ['multi-step-equations', 'Multi-Step Equations'],
  ['distributive-property', 'Distributive Property'],
  ['combining-like-terms', 'Combining Like Terms'],
  ['slope-from-two-points', 'Slope From Two Points'],
  ['graphing-linear-equations', 'Graphing Linear Equations'],
  ['systems-by-substitution', 'Systems by Substitution'],
  ['integer-operations', 'Integer Operations'],
  ['fraction-operations', 'Fraction Operations'],
  ['percent-change', 'Percent Change'],
  ['pythagorean-theorem', 'Pythagorean Theorem'],
  ['exponent-rules', 'Exponent Rules'],
  ['factoring-trinomials', 'Factoring Trinomials'],
];

const FIRST = ['Ava', 'Liam', 'Maya', 'Noah', 'Zoe', 'Ethan', 'Ivy', 'Lucas', 'Nora', 'Mateo', 'Aria', 'Kai', 'Leah', 'Omar', 'Ruby', 'Theo',
  'Isla', 'Jonah', 'Elena', 'Caleb', 'Priya', 'Owen', 'Hana', 'Diego', 'Stella', 'Felix', 'June', 'Amir', 'Clara', 'Malik', 'Tess', 'Ravi'];
const LAST = ['Nguyen', 'Brooks', 'Patel', 'Garcia', 'Kim', 'Okafor', 'Rossi', 'Haddad', 'Silva', 'Novak', 'Chen', 'Reyes', 'Ward', 'Adeyemi',
  'Larsen', 'Moreau', 'Sato', 'Bauer', 'Costa', 'Ibrahim', 'Doyle', 'Mendez', 'Park', 'Quinn', 'Ortiz', 'Hale', 'Vega', 'Wolfe', 'Yilmaz', 'Zhou', 'Fox', 'Gray'];

function entry(status, extra = {}) {
  return { status, masteryScore: 0, rung: status === 'mastered' ? 'proved' : (status === 'ready' ? 'none' : 'learned'), ...extra };
}

/** The roster: every archetype a real class has. */
function roster(now) {
  const at = days => new Date(now - days * DAY);
  const people = [];
  let i = 0;
  const next = () => ({ firstName: FIRST[i % FIRST.length], lastName: LAST[(i * 7) % LAST.length], i: i++ });

  // Working this week, doing fine.
  for (let k = 0; k < 4; k++) {
    people.push({ ...next(), kind: 'thriving', grade: '8', lastLogin: at(k * 0.4), sessions: [[0.1 + k * 0.5, 22 - k * 3], [2 + k, 15], [8, 18], [15, 12]],
      skills: { 'one-step-equations': entry('mastered', { masteryScore: 100, masteredDate: at(4 + k) }), 'two-step-equations': entry('mastered', { masteryScore: 92, masteredDate: at(1 + k) }),
        'distributive-property': entry('practicing', { masteryScore: 64, lastPracticed: at(0.2 + k), pillars: { accuracy: { correct: 7, total: 9, percentage: 0.78 } } }) } });
  }
  // Working this week and stuck (each a different kind of evidence).
  people.push({ ...next(), kind: 'stuck-flagged', grade: '8', lastLogin: at(0.05), sessions: [[0.05, 18], [1, 12], [9, 6]],
    skills: { 'two-step-equations': entry('learning', { masteryScore: 30, lastPracticed: at(0.05), strugglingAreas: ['undoing subtraction before division', 'sign errors'] }),
      'one-step-equations': entry('mastered', { masteryScore: 1 }) } });
  people.push({ ...next(), kind: 'stuck-accuracy', grade: '8', lastLogin: at(1.2), sessions: [[1.2, 25], [3, 20]],
    skills: { 'slope-from-two-points': entry('practicing', { masteryScore: 41, lastPracticed: at(1.2), pillars: { accuracy: { correct: 3, total: 9, percentage: 0.33 } } }),
      'graphing-linear-equations': entry('learning', { masteryScore: 30, lastPracticed: at(1.3) }) } });
  people.push({ ...next(), kind: 'stuck-check', grade: '9', lastLogin: at(2.5), sessions: [[2.5, 11]],
    // Same skill as stuck-flagged: two students stuck on one skill is a small group ("Teach this next").
    skills: { 'two-step-equations': entry('learning', { masteryScore: 50, explicitlyFailed: true, failureDate: at(2.5), lastPracticed: at(2.5) }),
      'fraction-operations': entry('practicing', { masteryScore: 60, lastPracticed: at(2.5) }) } });
  // Just started a skill (seeded at 30) — must NOT read as needing help.
  people.push({ ...next(), kind: 'just-started', grade: '8', lastLogin: at(0.3), sessions: [[0.3, 9]],
    skills: { 'combining-like-terms': entry('learning', { masteryScore: 30, lastPracticed: at(0.3) }) } });
  // Slipping on review.
  people.push({ ...next(), kind: 'slipping', grade: '8', lastLogin: at(3), sessions: [[3, 14], [10, 20]],
    skills: { 'integer-operations': entry('re-fragile', { masteryScore: 70, lastPracticed: at(20) }), 'percent-change': entry('mastered', { masteryScore: 88, masteredDate: at(12) }) } });
  // Lapsed: was working, stopped 8-25 days ago.
  [9, 16, 24].forEach(d => people.push({ ...next(), kind: 'lapsed', grade: '8', lastLogin: at(d), sessions: [[d, 17], [d + 6, 21]],
    skills: { 'pythagorean-theorem': entry('practicing', { masteryScore: 55, lastPracticed: at(d) }) } }));
  // Signed up this month, never started.
  [3, 6].forEach(d => people.push({ ...next(), kind: 'new-never-started', grade: '8', createdAt: at(d), lastLogin: null, sessions: [], skills: {} }));
  // Last school year's long tail: stale weekly counters, legacy 0-1 seeds,
  // some with history but no lastLogin (the "Never" bug).
  for (let k = 0; k < 14; k++) {
    const gone = 140 + k * 12;
    const noLogin = k % 4 === 0;
    people.push({ ...next(), kind: 'last-year', grade: k % 3 === 0 ? null : '9', createdAt: at(gone + 120), lastLogin: noLogin ? null : at(gone),
      staleWeekly: 10 + k * 7, staleResetAt: at(gone), sessions: [[gone, 20 + k], [gone + 4, 12]],
      skills: { 'exponent-rules': entry('mastered', { masteryScore: 1 }), 'factoring-trinomials': entry('learning', { masteryScore: 0.5, lastPracticed: at(gone) }),
        'multi-step-equations': entry('ready', { masteryScore: 0 }) } });
  }
  return people;
}

async function seed(now = Date.now()) {
  const User = require('../models/user');
  const Conversation = require('../models/conversation');
  const Skill = require('../models/skill');

  await Skill.collection.insertMany(SKILLS.map(([skillId, displayName]) => ({ skillId, displayName, category: 'linear-equations', course: 'Algebra 1' })));

  const mkTeacher = (email, firstName, lastName) => User.create({
    username: email.split('@')[0].replace(/\W/g, ''), email, firstName, lastName,
    role: 'teacher', roles: ['teacher'], passwordHash: SANDBOX_PASSWORD,
    needsProfileCompletion: false, onboarding: { completed: true },
  });
  const teacher = await mkTeacher('sandbox.teacher@mathmatix.test', 'Sam', 'Sandbox');
  await mkTeacher('empty.teacher@mathmatix.test', 'Emery', 'Empty');

  const counts = {};
  let firstStudent = null;
  for (const p of roster(now)) {
    counts[p.kind] = (counts[p.kind] || 0) + 1;
    const level = 1 + Math.floor(((p.i * 37) % 11) * (p.kind === 'thriving' ? 1.5 : 0.6));
    const student = await User.create({
      username: `${p.firstName}${p.lastName}${p.i}`.toLowerCase(), email: `${p.firstName}.${p.lastName}.${p.i}@students.mathmatix.test`.toLowerCase(),
      firstName: p.firstName, lastName: p.lastName, role: 'student', roles: ['student'],
      gradeLevel: p.grade || undefined, teacherId: teacher._id, level, xp: level * 140,
      lastLogin: p.lastLogin || undefined,
      weeklyActiveTutoringMinutes: p.staleWeekly || 0,
      lastWeeklyReset: p.staleResetAt || new Date(now - 2 * DAY),
      totalActiveTutoringMinutes: p.sessions.reduce((s, [, m]) => s + m, 0),
      skillMastery: p.skills, selectedTutorId: 'mr-nappier', needsProfileCompletion: false,
    });
    if (p.createdAt) await User.collection.updateOne({ _id: student._id }, { $set: { createdAt: p.createdAt } });
    if (!firstStudent && p.kind === 'thriving') firstStudent = student;
    if (p.sessions.length) {
      await Conversation.collection.insertMany(p.sessions.map(([daysAgo, minutes], s) => ({
        userId: student._id, conversationName: 'Math Session', isActive: false,
        startDate: new Date(now - daysAgo * DAY - minutes * 60000), lastActivity: new Date(now - daysAgo * DAY),
        activeMinutes: minutes, activeSeconds: minutes * 60, messages: [],
        summary: s === 0 && p.kind === 'stuck-flagged'
          ? 'Worked on solving \\( 3x - 7 = 11 \\). Kept dividing before adding 7; got there with a worked example.'
          : `Practiced ${(Object.keys(p.skills)[0] || 'algebra').replace(/-/g, ' ')} for ${minutes} minutes.`,
        problemsAttempted: Math.round(minutes / 2), problemsCorrect: Math.round(minutes / 3),
      })));
    }
  }
  // Sign-in-able student (the first "thriving" one) for testing the student side.
  if (firstStudent) {
    firstStudent.email = 'sandbox.student@mathmatix.test';
    firstStudent.passwordHash = SANDBOX_PASSWORD;
    await firstStudent.save();
  }

  // A worksheet the teacher pushed to the tutor, with a real local file.
  const TeacherResource = require('../models/teacherResource');
  const dir = path.join(__dirname, '..', 'uploads', 'teacher-resources');
  fs.mkdirSync(dir, { recursive: true });
  const stored = 'sandbox-two-step-practice.png';
  // 1x1 PNG — the file only has to download; the tutor works from extractedText.
  fs.writeFileSync(path.join(dir, stored), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64'));
  await TeacherResource.create({
    teacherId: teacher._id, displayName: 'Two-Step Equations Practice', originalFilename: stored, storedFilename: stored,
    fileType: 'png', mimeType: 'image/png', fileSize: 68, category: 'practice', isPublished: true,
    extractedText: '1) 3x - 7 = 11\n2) 5x + 4 = 29\n3) -2x + 9 = 1\n4) x/4 - 3 = 2\n5) 7 - 3x = 22',
    tutorAssignment: { active: true, pushedAt: new Date(now - DAY), startsAt: new Date(now - DAY), endsAt: new Date(now + 10 * DAY),
      note: 'We just learned undoing operations in reverse order. Start with #1 and #2.', starts: [] },
  });
  await seedPracticeTests(now);
  return { teacher, counts };
}

/* Practice-test history for the Test Prep tab: growth, a rushed attempt, an
   easier SAT route, an unfinished one — every flag the teacher view shows. */
async function seedPracticeTests(now) {
  const User = require('../models/user');
  const ActTestSession = require('../models/actTestSession');
  const students = await User.find({ email: /students\.mathmatix\.test|sandbox\.student/ }).sort({ _id: 1 }).limit(10).lean();
  const ACT = ['number-quantity', 'algebra', 'functions', 'geometry', 'statistics-probability', 'integrating-essential-skills'];
  const SAT = ['algebra', 'advanced-math', 'problem-solving-data', 'geometry-trig'];
  const shape = {
    'act-math': { n: 45, limit: 50, cats: ACT }, 'preact-math': { n: 36, limit: 45, cats: ACT },
    'sat-math': { n: 44, limit: 70, cats: SAT, modular: true }, 'psat-math': { n: 44, limit: 70, cats: SAT, modular: true },
  };
  const docs = [];
  const take = (u, testId, daysAgo, { pct = 0.6, minutes, scaled, weak = 'statistics-probability', blanks = 0, route } = {}) => {
    const sh = shape[testId];
    const start = new Date(now - daysAgo * DAY);
    const used = minutes || Math.round(sh.limit * 0.85);
    const responses = Array.from({ length: sh.n }, (_, i) => {
      const category = sh.cats[i % sh.cats.length];
      const p = category === weak || (weak === 'statistics-probability' && category === 'problem-solving-data') ? pct - 0.3 : pct;
      return { position: i, problemId: `${testId}-${i}`, category, answer: i < blanks ? '' : 'A', correct: i >= blanks && ((i * 37) % 100) / 100 < p };
    });
    const raw = responses.filter(r => r.correct).length;
    docs.push({
      userId: u._id, testId, status: 'completed', startedAt: start, completedAt: new Date(start.getTime() + used * 60000),
      timeLimitMinutes: sh.modular ? 35 : sh.limit,
      modules: sh.modular ? [{ n: 1, startedAt: start }, { n: 2, route: route || 'harder', startedAt: new Date(start.getTime() + used * 30000) }] : [],
      items: responses.map(r => ({ position: r.position, problemId: r.problemId, category: r.category })),
      responses, rawScore: raw, scaledScore: scaled, createdAt: start, updatedAt: start,
    });
  };
  const [a, b, c, d, e, f, g, h] = students;
  if (a) { take(a, 'act-math', 30, { pct: 0.55, scaled: 21 }); take(a, 'act-math', 6, { pct: 0.7, scaled: 25 }); take(a, 'sat-math', 12, { pct: 0.65, scaled: 590 }); }
  if (b) { take(b, 'act-math', 20, { pct: 0.5, scaled: 19 }); take(b, 'act-math', 2, { pct: 0.8, minutes: 9, scaled: 27 }); }
  if (c) { take(c, 'sat-math', 9, { pct: 0.45, scaled: 470, route: 'easier' }); take(c, 'psat-math', 40, { pct: 0.4, scaled: 430 }); }
  if (d) { take(d, 'preact-math', 15, { pct: 0.6, scaled: 22 }); take(d, 'preact-math', 3, { pct: 0.68, scaled: 24, weak: 'geometry' }); }
  if (e) { take(e, 'act-math', 4, { pct: 0.6, scaled: 23, blanks: 8 }); }
  if (f) { take(f, 'psat-math', 10, { pct: 0.6, scaled: 520 }); take(f, 'psat-math', 1, { pct: 0.7, scaled: 560 }); }
  if (g) { take(g, 'act-math', 8, { pct: 0.75, scaled: 28, weak: 'functions' }); }
  if (h) { take(h, 'sat-math', 5, { pct: 0.72, scaled: 640 }); }
  if (docs.length) await ActTestSession.collection.insertMany(docs);
}

async function main() {
  const { MongoMemoryServer } = require('mongodb-memory-server');
  const mem = await MongoMemoryServer.create();
  // Overwrite BEFORE anything requires config/database — the .env value is prod.
  process.env.MONGO_URI = mem.getUri('mathmatix-sandbox');
  process.env.NODE_ENV = 'development';
  process.env.PORT = process.env.SANDBOX_PORT || '3077';
  delete process.env.SENTRY_DSN;
  // The main .env carries LIVE outbound credentials. A sandbox must never send
  // mail through the production SMTP server, charge through Stripe, or write
  // to a storage bucket — strip them all so those paths fall back to local/no-op.
  Object.keys(process.env)
    .filter(k => /^(SMTP_|EMAIL_|STRIPE_|S3_|AWS_|R2_|SENDGRID|POSTMARK|SES_)/.test(k))
    .forEach(k => { delete process.env[k]; });
  if (/mongodb\.net/.test(process.env.MONGO_URI)) throw new Error('refusing to run against Atlas');

  const mongoose = require('mongoose');
  await mongoose.connect(process.env.MONGO_URI);
  const { counts } = await seed();
  await mongoose.disconnect();
  console.log('[sandbox] seeded roster:', counts);
  console.log('[sandbox] sign in at /login.html as sandbox.teacher@mathmatix.test (see header of this file)');

  const shutdown = async () => { await mem.stop().catch(() => {}); process.exit(0); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  require('../server');
}

if (require.main === module) {
  main().catch(err => { console.error('[sandbox] failed:', err); process.exit(1); });
}

module.exports = { roster, seed, SANDBOX_PASSWORD };
