/**
 * DRILL USAGE REPORT — every student who has used the Two-Minute Drill, site-wide.
 *
 * The teacher pages (/drill-practice, /fact-fluency) answer "how is MY class doing"; this
 * answers the owner's question: who is using the drill at all, how much, and on what. One row
 * per student, from the two durable records the drill keeps:
 *   - models/drillResult.js  — solo rounds at /drill/<hub> (one document per round, SELF-REPORTED:
 *     the browser plays and scores the round, so a score is whatever the page said);
 *   - models/factFluency.js  — Math Facts answers from LIVE class games (server-graded).
 *
 * What it cannot show, and says so in `caveats`: a live class game in any drill other than Math
 * Facts leaves NO per-student record (the game shadow, models/liveDrillGame.js, expires three
 * hours after the game), and a guest who joined with only a code or practised without signing
 * in is nowhere. Those are not bugs in this report; they are what the drill stores today.
 *
 * Served on GET /api/admin/reports/drill-usage (JSON or CSV) and by scripts/drillUsageReport.js
 * for a Render shell. The shaping (summarizeStudents, toCsv) is pure so it can be tested
 * without a database; buildDrillUsageReport is the one function that touches Mongo.
 */
const DrillResult = require('../models/drillResult');
const FactFluency = require('../models/factFluency');
const User = require('../models/user');
const EnrollmentCode = require('../models/enrollmentCode');
const { gameNames } = require('./liveDrill/practice');
const fluency = require('./liveDrill/fluency');
const { HUBS } = require('./liveDrill/solo');

const DEFAULT_DAYS = 30;
const MAX_DAYS = 3650;

const CAVEATS = [
  'Solo rounds (score, right, attempted) are self-reported by the browser — effort and recency are reliable, scores are not assessment evidence.',
  'Live class games are recorded per student ONLY for Math Facts (fact fluency). A Team Drive, Huddle or King of the Hill game in any other drill leaves no per-student record once it ends.',
  'Guests — a code-only player in a class game, or a solo player who is not signed in — are not in this report at all.',
  'Minutes are the clock each solo round was set to, not time on the page.',
];

const nameOf = (u) => [u && u.firstName, u && u.lastName].filter(Boolean).join(' ').trim() || (u && u.username) || '';

/** Clamp a "last N days" window; 0 or anything unparseable means the default. */
function windowDays(raw) {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_DAYS;
  return Math.min(n, MAX_DAYS);
}

/**
 * Fold the raw records into one row per student. Pure.
 * @param {Array} users   [{ _id, firstName, lastName, username, email, gradeLevel }]
 * @param {Array} rounds  DrillResult rows in the window (any order)
 * @param {Array} fluencyDocs FactFluency documents for those users (lifetime — the record is one doc)
 * @param {Map|Object} classesByUser  userId → [{ className, period, teacher }]
 * @param {Object} names  drill id → game name (practice.gameNames)
 */
function summarizeStudents(users, rounds, fluencyDocs, classesByUser, names = {}) {
  const roundsBy = new Map();
  for (const r of rounds || []) {
    const k = String(r.userId);
    if (!roundsBy.has(k)) roundsBy.set(k, []);
    roundsBy.get(k).push(r);
  }
  const fluencyBy = new Map((fluencyDocs || []).map((d) => [String(d.userId), d]));
  const classOf = (id) => (classesByUser instanceof Map ? classesByUser.get(id) : (classesByUser || {})[id]) || [];

  const rows = (users || []).map((u) => {
    const id = String(u._id);
    const rs = (roundsBy.get(id) || []).slice().sort((a, b) => new Date(a.playedAt || 0) - new Date(b.playedAt || 0));
    const fd = fluencyBy.get(id);
    const fs = fd ? fluency.summarize(fd) : null;
    const byGame = new Map();
    for (const r of rs) byGame.set(r.drill, (byGame.get(r.drill) || 0) + 1);
    const games = [...byGame.entries()].sort((a, b) => b[1] - a[1])
      .map(([drill, n]) => `${names[drill] || drill} ×${n}`);
    const seconds = rs.reduce((t, r) => t + (Number(r.seconds) || 0), 0);
    const right = rs.reduce((t, r) => t + (Number(r.right) || 0), 0);
    const attempted = rs.reduce((t, r) => t + (Number(r.attempted) || 0), 0);
    const lastSolo = rs.length ? rs[rs.length - 1].playedAt : null;
    const lastLive = fs && fs.lastGameAt ? fs.lastGameAt : null;
    const classes = classOf(id);
    return {
      id,
      name: nameOf(u),
      username: u.username || '',
      email: u.email || '',
      grade: u.gradeLevel == null ? '' : String(u.gradeLevel),
      classes: classes.map((c) => [c.className, c.period].filter(Boolean).join(' · ')).join('; '),
      teachers: [...new Set(classes.map((c) => c.teacher).filter(Boolean))].join('; '),
      soloRounds: rs.length,
      soloMinutes: Math.round(seconds / 60),
      soloRight: right,
      soloAttempted: attempted,
      soloAccuracy: attempted > 0 ? Math.round((right / attempted) * 100) : null,
      soloBest: rs.length ? Math.max(...rs.map((r) => r.score || 0)) : null,
      soloGames: games.join(', '),
      lastSoloAt: lastSolo,
      liveFactGames: fs ? fs.games : 0,
      factsTried: fs ? fs.tried : 0,
      factsFluent: fs ? fs.fluent : 0,
      factsMissed: fs ? fs.missed : 0,
      factsSlow: fs ? fs.slow : 0,
      lastLiveFactsAt: lastLive,
      lastActiveAt: [lastSolo, lastLive].filter(Boolean).sort((a, b) => new Date(b) - new Date(a))[0] || null,
    };
  });

  rows.sort((a, b) => new Date(b.lastActiveAt || 0) - new Date(a.lastActiveAt || 0) || a.name.localeCompare(b.name));

  const totals = {
    students: rows.length,
    soloPlayers: rows.filter((r) => r.soloRounds > 0).length,
    liveFactPlayers: rows.filter((r) => r.liveFactGames > 0).length,
    soloRounds: rows.reduce((t, r) => t + r.soloRounds, 0),
    // rounded once from raw seconds (see practice.summarizeClass)
    soloMinutes: Math.round((rounds || []).reduce((t, r) => t + (Number(r.seconds) || 0), 0) / 60),
    liveFactGames: rows.reduce((t, r) => t + r.liveFactGames, 0),
  };
  return { students: rows, totals };
}

const COLUMNS = [
  ['name', 'Student'], ['username', 'Username'], ['email', 'Email'], ['grade', 'Grade'],
  ['classes', 'Classes'], ['teachers', 'Teachers'],
  ['soloRounds', 'Solo rounds'], ['soloMinutes', 'Solo minutes'], ['soloRight', 'Solo right'],
  ['soloAttempted', 'Solo attempted'], ['soloAccuracy', 'Solo accuracy %'], ['soloBest', 'Solo best score'],
  ['soloGames', 'Solo games'], ['lastSoloAt', 'Last solo round'],
  ['liveFactGames', 'Live Math Facts games'], ['factsTried', 'Facts tried'], ['factsFluent', 'Facts fluent'],
  ['factsMissed', 'Facts missed'], ['factsSlow', 'Facts slow'], ['lastLiveFactsAt', 'Last live Math Facts'],
  ['lastActiveAt', 'Last drill activity'], ['id', 'User id'],
];

/** RFC 4180-ish: quote anything with a comma, quote or newline; dates as ISO; null as blank.
 *  A leading = + - @ is prefixed with a quote so a spreadsheet never runs a cell as a formula. */
function csvCell(v) {
  if (v == null) return '';
  let s = v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(students) {
  const head = COLUMNS.map(([, label]) => csvCell(label)).join(',');
  const body = (students || []).map((s) => COLUMNS.map(([k]) => csvCell(s[k])).join(','));
  return [head, ...body].join('\r\n') + '\r\n';
}

/** Which students are in which class, with the teacher's name. */
async function classesByStudent(userIds) {
  const classes = await EnrollmentCode.find(
    { isActive: { $ne: false }, 'enrolledStudents.studentId': { $in: userIds } },
    'className period teacherId enrolledStudents.studentId',
  ).populate('teacherId', 'firstName lastName').lean();
  const map = new Map();
  for (const c of classes) {
    const teacher = nameOf(c.teacherId);
    for (const e of c.enrolledStudents || []) {
      const id = String(e.studentId);
      if (!map.has(id)) map.set(id, []);
      map.get(id).push({ className: c.className, period: c.period, teacher });
    }
  }
  return map;
}

/**
 * The report, from the database.
 * @param {{days?:number|string, since?:Date}} opts  the window for solo rounds; fluency is lifetime
 *   but a student is included only if they have a round in the window OR a live game in it.
 */
async function buildDrillUsageReport(opts = {}) {
  const days = opts.since ? null : windowDays(opts.days);
  const since = opts.since ? new Date(opts.since) : new Date(Date.now() - days * 86400000);

  const [rounds, fluencyDocs] = await Promise.all([
    DrillResult.find({ playedAt: { $gte: since } }).lean(),
    FactFluency.find({ lastGameAt: { $gte: since } }).lean(),
  ]);
  const ids = [...new Set([...rounds.map((r) => String(r.userId)), ...fluencyDocs.map((d) => String(d.userId))])];
  const [users, classes] = await Promise.all([
    User.find({ _id: { $in: ids } }, 'firstName lastName username email gradeLevel').lean(),
    classesByStudent(ids),
  ]);
  const { students, totals } = summarizeStudents(users, rounds, fluencyDocs, classes, gameNames(HUBS));
  return {
    generatedAt: new Date(),
    window: { since, days },
    totals,
    students,
    caveats: CAVEATS,
  };
}

module.exports = { buildDrillUsageReport, summarizeStudents, toCsv, csvCell, windowDays, COLUMNS, CAVEATS, DEFAULT_DAYS, MAX_DAYS };
