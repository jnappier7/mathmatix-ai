/**
 * Live Two-Minute Drill — a whole-class game with a join code.
 *
 *   /api/live-drill/host/*  teacher only (isAuthenticated + isTeacher, CSRF as usual)
 *   /api/live-drill/play/*  PUBLIC: students join with a code and a name, no account. A player
 *                           is a bearer token (X-Live-Drill-Token header; `?t=` on the SSE
 *                           stream, which can't send headers). CSRF-exempt — nothing here rides
 *                           a cookie — and off the global apiLimiter, because a whole class
 *                           shares one school IP; `playLimiter` keys on the token instead.
 *   /api/live-drill/solo/*  PUBLIC: solo practice (public/drill.html at /drill/<hub>). Dealing
 *                           plays is GET and open to anyone — whole plays, answer included,
 *                           nothing graded server-side (utils/liveDrill/solo.js). Off the global
 *                           apiLimiter like /play. Two routes here DO touch an account:
 *                           GET /me reports whether you are signed in (and your best in one
 *                           game), and POST /result files a finished round for a signed-in
 *                           STUDENT (models/drillResult.js). Both are cookie-session and so
 *                           CSRF-protected as usual — deliberately NOT on the exempt list.
 *   /api/live-drill/mine/*  signed-in students (isAuthenticated, CSRF as usual): the chat-screen
 *                           banner asks which of MY classes has a game open, and joins with the
 *                           account's name — no code, nothing typed. /mine/fluency is my own
 *                           math-facts record.
 *
 * Math-facts fluency is SAVED to signed-in students' accounts when a Math Facts game ends
 * (utils/liveDrill/fluency.js → models/factFluency.js). Teachers read it per class at
 * /host/fluency/… — only for their own classes, and every read goes to the FERPA access log.
 *
 * The game itself — rules, scoring, what each screen may see — is utils/liveDrill/games.js.
 * Pages: public/live-drill-host.html (projector), public/play.html (students, at /play).
 */
const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const QRCode = require('qrcode');
const mongoose = require('mongoose');
const EnrollmentCode = require('../models/enrollmentCode');
const User = require('../models/user');
const FactFluency = require('../models/factFluency');
const DrillResult = require('../models/drillResult');
const { logRecordAccess } = require('../middleware/ferpaAccessLog');
const fluency = require('../utils/liveDrill/fluency');
const { userHasRole } = require('../utils/roleQuery');
const logger = require('../utils/logger').child({ route: 'liveDrill' });
const G = require('../utils/liveDrill/games');
const { DRILLS, listPlaybooks } = require('../utils/liveDrill/engine');
const { FOCUSABLE, FOCUS_MAX } = require('../utils/liveDrill/facts');
const solo = require('../utils/liveDrill/solo');
const drillSearch = require('../utils/liveDrill/search');
const practice = require('../utils/liveDrill/practice');
const store = require('../utils/liveDrill/store'); // revives a game this process hasn't seen (after a deploy)

// Every finished Math Facts game folds into its signed-in students' records.
G.onGameOver((game) => fluency.saveGame(game, FactFluency));

const hostRouter = express.Router();
const playRouter = express.Router();
const mineRouter = express.Router();
const soloRouter = express.Router();

// A process that has handed its games off (SIGTERM) must not play them: the phone retries and
// lands on the new process. Solo practice has no game state and keeps serving.
const MOVING = { message: 'The game is moving to a new server. One moment…', retry: true };
const notHandingOff = (req, res, next) => (store.isHandingOff() ? res.status(503).json(MOVING) : next());
hostRouter.use(notHandingOff);
playRouter.use(notHandingOff);
mineRouter.use(notHandingOff);

const TOKEN_HEADER = 'x-live-drill-token';

function send(res, err) {
  if (err instanceof G.GameError) return res.status(err.status).json({ message: err.message });
  logger.error('live drill error', { error: err.message, stack: err.stack });
  return res.status(500).json({ message: 'Something went wrong with the game.' });
}

/** Open an SSE stream and keep it alive through Render's proxy. */
function openStream(req, res, game, listener) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 2000\n\n');
  const unsubscribe = G.subscribe(game, { ...listener, res });
  const beat = setInterval(() => { try { res.write(': hb\n\n'); } catch { /* gone */ } }, 15000);
  req.on('close', () => { clearInterval(beat); unsubscribe(); });
}

// ---------------------------------------------------------------------------
// host (teacher)
// ---------------------------------------------------------------------------

hostRouter.get('/drills', (req, res) => {
  try {
    const drills = Object.entries(DRILLS).map(([id, d]) => {
      try {
        const out = { id, title: d.title, playbooks: listPlaybooks(id), settings: G.settingsFor(id) };
        if (d.focus) out.focusable = { books: FOCUSABLE, max: FOCUS_MAX }; // Math Facts: pick the numbers
        return out;
      } catch (e) {
        logger.error('drill bank unreadable', { drill: id, error: e.message });
        return { id, title: d.title, playbooks: [], unavailable: true };
      }
    });
    res.json({ drills, settings: G.SETTINGS });
  } catch (err) { send(res, err); }
});

/** The host's classes, for the "Which class?" picker. Same rosters as Class Activities. */
hostRouter.get('/classes', async (req, res) => {
  try {
    const classes = await EnrollmentCode.find({ teacherId: req.user._id, isActive: { $ne: false } }, '_id className period enrolledStudents')
      .sort({ className: 1 }).lean();
    res.json({ classes: classes.map((c) => ({
      id: String(c._id), name: [c.className, c.period].filter(Boolean).join(' · '), students: (c.enrolledStudents || []).length,
    })) });
  } catch (err) { send(res, err); }
});

// ---------------------------------------------------------------------------
// math-facts fluency (saved across games)
// ---------------------------------------------------------------------------

/** The teacher's own class, or a 404 — a teacher never reads another class's records. */
async function myClass(req) {
  if (!mongoose.Types.ObjectId.isValid(req.params.classId)) return null;
  return EnrollmentCode.findOne({ _id: req.params.classId, teacherId: req.user._id }, '_id className period enrolledStudents').lean();
}
const fullName = (u) => personName(u) || 'Student';

/** A class's fact fluency: every enrolled student's summary and the class grid. */
hostRouter.get('/fluency/classes/:classId',
  logRecordAccess('skill_mastery', 'teaching_instruction', { getStudentIds: (req) => req.accessedStudentIds, accessType: 'view' }),
  async (req, res) => {
    try {
      const cls = await myClass(req);
      if (!cls) return res.status(404).json({ message: 'That class was not found.' });
      const ids = (cls.enrolledStudents || []).map((e) => e.studentId).filter(Boolean);
      const [users, docs] = await Promise.all([
        User.find({ _id: { $in: ids } }, 'firstName lastName').lean(),
        FactFluency.find({ userId: { $in: ids } }).lean(),
      ]);
      const byUser = new Map(docs.map((d) => [String(d.userId), d]));
      const students = users.map((u) => {
        const { rows: _rows, ...sum } = fluency.summarize(byUser.get(String(u._id)));
        return { id: String(u._id), name: fullName(u), ...sum };
      }).sort((a, b) => a.name.localeCompare(b.name));
      req.accessedStudentIds = docs.map((d) => String(d.userId)); // logged: the records actually read
      res.json({
        className: [cls.className, cls.period].filter(Boolean).join(' · '),
        students,
        grids: fluency.classGrid(docs.map((d) => fluency.summarize(d))),
        fluentSec: G.FLUENT_MS / 1000,
      });
    } catch (err) { send(res, err); }
  });

/** One student's facts, fact by fact — only a student enrolled in one of the teacher's classes. */
hostRouter.get('/fluency/classes/:classId/students/:studentId',
  logRecordAccess('skill_mastery', 'teaching_instruction', { getStudentId: (req) => req.accessedStudentId, accessType: 'view' }),
  async (req, res) => {
    try {
      const cls = await myClass(req);
      const sid = req.params.studentId;
      if (!cls || !(cls.enrolledStudents || []).some((e) => String(e.studentId) === sid)) {
        return res.status(404).json({ message: 'That student is not in this class.' });
      }
      const [u, doc] = await Promise.all([User.findById(sid, 'firstName lastName').lean(), FactFluency.findOne({ userId: sid }).lean()]);
      const sum = fluency.summarize(doc);
      req.accessedStudentId = sid;
      res.json({ id: sid, name: fullName(u), ...sum, grids: fluency.studentGrid(sum), fluentSec: G.FLUENT_MS / 1000 });
    } catch (err) { send(res, err); }
  });

// ---------------------------------------------------------------------------
// Solo practice, for the teacher who assigned it (models/drillResult.js)
// ---------------------------------------------------------------------------
// recordType is 'progress_data', NOT 'assessment_results': these rounds are
// self-reported by the browser, and logging them as assessment would put a
// claim in the audit trail that the data cannot support.

/** A class's practice: every enrolled student, including those with none. */
hostRouter.get('/practice/classes/:classId',
  logRecordAccess('progress_data', 'teaching_instruction', { getStudentIds: (req) => req.accessedStudentIds, accessType: 'view' }),
  async (req, res) => {
    try {
      const cls = await myClass(req);
      if (!cls) return res.status(404).json({ message: 'That class was not found.' });
      const ids = (cls.enrolledStudents || []).map((e) => e.studentId).filter(Boolean);
      const [users, rows] = await Promise.all([
        User.find({ _id: { $in: ids } }, 'firstName lastName').lean(),
        DrillResult.find({ userId: { $in: ids } }, 'userId drill seconds score playedAt').lean(),
      ]);
      const roster = users.map((u) => ({ id: String(u._id), name: fullName(u) }));
      const { students, totals } = practice.summarizeClass(roster, rows);
      req.accessedStudentIds = [...new Set(rows.map((r) => String(r.userId)))]; // logged: records actually read
      res.json({
        className: [cls.className, cls.period].filter(Boolean).join(' · '),
        names: practice.gameNames(solo.HUBS),
        students,
        totals,
      });
    } catch (err) { send(res, err); }
  });

/** One student's rounds, newest first — only a student in one of my classes. */
hostRouter.get('/practice/classes/:classId/students/:studentId',
  logRecordAccess('progress_data', 'teaching_instruction', { getStudentId: (req) => req.accessedStudentId, accessType: 'view' }),
  async (req, res) => {
    try {
      const cls = await myClass(req);
      const sid = req.params.studentId;
      if (!cls || !(cls.enrolledStudents || []).some((e) => String(e.studentId) === sid)) {
        return res.status(404).json({ message: 'That student is not in this class.' });
      }
      const [u, rows] = await Promise.all([
        User.findById(sid, 'firstName lastName').lean(),
        DrillResult.find({ userId: sid }).sort({ playedAt: -1 }).limit(200).lean(),
      ]);
      req.accessedStudentId = sid;
      res.json({
        id: sid,
        name: fullName(u),
        names: practice.gameNames(solo.HUBS),
        ...practice.summarizeStudent(rows),
        recent: rows.slice(0, 50).map((r) => ({
          drill: r.drill, playbook: r.playbook, seconds: r.seconds,
          score: r.score, right: r.right, attempted: r.attempted, playedAt: r.playedAt,
        })),
      });
    } catch (err) { send(res, err); }
  });

const personName = (u) => [u && u.firstName, u && u.lastName].filter(Boolean).join(' ').trim();

hostRouter.post('/games', async (req, res) => {
  try {
    const { drill, playbook, mode, seconds, plays, secondsPerPlay, classId, focus } = req.body || {};
    let cls = null;
    if (classId) {
      const c = await EnrollmentCode.findOne({ _id: classId, teacherId: req.user._id }, '_id className period').lean().catch(() => null);
      if (!c) return res.status(404).json({ message: 'That class was not found.' });
      cls = { id: c._id, name: [c.className, c.period].filter(Boolean).join(' · ') };
    }
    const game = G.createGame({ hostId: req.user._id, hostName: personName(req.user), cls, drill, playbook, mode, seconds, plays, secondsPerPlay, focus });
    logger.info('live drill hosted', { code: game.code, drill: game.drill, mode: game.mode, teacher: String(req.user._id) });
    res.status(201).json(G.hostView(game));
  } catch (err) {
    if (!(err instanceof G.GameError) && /item bank|drill page/.test(err.message)) {
      logger.error('drill bank unreadable', { error: err.message });
      return res.status(503).json({ message: 'That drill is unavailable right now.' });
    }
    send(res, err);
  }
});

hostRouter.get('/games/:code/stream', async (req, res) => {
  try {
    await store.load(req.params.code);
    const game = G.hostGame(req.params.code, req.user._id);
    openStream(req, res, game, { kind: 'host' });
  } catch (err) { send(res, err); }
});

hostRouter.get('/games/:code', async (req, res) => {
  try {
    await store.load(req.params.code);
    res.json(G.hostView(G.hostGame(req.params.code, req.user._id)));
  } catch (err) { send(res, err); }
});

const hostAction = (fn) => async (req, res) => {
  try {
    await store.load(req.params.code);
    const game = G.hostGame(req.params.code, req.user._id);
    fn(game, req);
    res.json(G.hostView(game));
  } catch (err) { send(res, err); }
};

hostRouter.post('/games/:code/start', hostAction((g) => G.start(g)));
hostRouter.post('/games/:code/advance', hostAction((g) => G.advance(g)));
hostRouter.post('/games/:code/end', hostAction((g) => G.endGame(g)));
hostRouter.post('/games/:code/rematch', hostAction((g) => G.rematch(g)));

/** The lobby's QR code: the join link with the code already in it, so a scan lands on "your name". */
hostRouter.get('/games/:code/qr.svg', async (req, res) => {
  try {
    await store.load(req.params.code);
    const game = G.hostGame(req.params.code, req.user._id);
    const url = `${req.protocol}://${req.get('host')}/play?code=${game.code}`;
    const svg = await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0b1a22', light: '#ffffff' } });
    res.set('Cache-Control', 'private, max-age=3600').type('image/svg+xml').send(svg);
  } catch (err) { send(res, err); }
});
hostRouter.post('/games/:code/players/:id/kick', hostAction((g, req) => G.kick(g, req.params.id)));
hostRouter.post('/games/:code/players/:id/team', hostAction((g, req) => G.setTeam(g, req.params.id, Number(req.body && req.body.team))));

// ---------------------------------------------------------------------------
// players (public)
// ---------------------------------------------------------------------------

const tokenKey = (t) => crypto.createHash('sha256').update(String(t)).digest('hex').slice(0, 32);

// A drive player answers about once every 3–6 s and fetches the next play after each answer;
// 600 per 5 minutes is ~4× that. The per-IP ceiling is sized for a whole school behind one
// NAT, so minting tokens can't turn the per-token key into an unlimited one.
const playLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 600,
  keyGenerator: (req) => {
    const t = req.get(TOKEN_HEADER) || req.query.t;
    return t && String(t).length >= 24 ? 't:' + tokenKey(t) : 'ip:' + req.ip;
  },
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests. Wait a moment and try again.' },
});
const playIpLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, max: 20000, keyGenerator: (req) => req.ip,
  standardHeaders: true, legacyHeaders: false,
  message: { message: 'Too many requests from this network.' },
});
// Joining: a class of 35, plus rejoins after a dropped phone. Wrong codes count too, so the
// code space (31^6) can't be walked from one network.
const joinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 300, keyGenerator: (req) => req.ip,
  standardHeaders: true, legacyHeaders: false,
  message: { message: 'Too many join attempts from this network. Wait a few minutes.' },
});

playRouter.use(playIpLimiter);

playRouter.post('/join', joinLimiter, async (req, res) => {
  try {
    const { code, name } = req.body || {};
    const game = await store.load(code);
    if (!game) return res.status(404).json({ message: 'No game with that code. Check the board and try again.' });
    const { token, player } = G.join(game, name);
    res.status(201).json({ token, code: game.code, playerId: player.id, name: player.name, team: player.team });
  } catch (err) { send(res, err); }
});

async function withPlayer(req) {
  const game = await store.load(req.params.code);
  if (!game) throw new G.GameError(404, 'That game has ended.');
  const player = G.playerFor(game, req.get(TOKEN_HEADER) || req.query.t);
  return { game, player };
}

playRouter.get('/:code/stream', playLimiter, async (req, res) => {
  try {
    const { game, player } = await withPlayer(req);
    openStream(req, res, game, { kind: 'player', playerId: player.id });
  } catch (err) { send(res, err); }
});

playRouter.get('/:code/state', playLimiter, async (req, res) => {
  try {
    const { game, player } = await withPlayer(req);
    res.json(G.playerView(game, player));
  } catch (err) { send(res, err); }
});

playRouter.get('/:code/play', playLimiter, async (req, res) => {
  try {
    const { game, player } = await withPlayer(req);
    res.set('Cache-Control', 'no-store');
    res.json(G.currentPlay(game, player));
  } catch (err) { send(res, err); }
});

playRouter.post('/:code/answer', playLimiter, async (req, res) => {
  try {
    const { game, player } = await withPlayer(req);
    const { n, k } = req.body || {};
    res.json(G.answer(game, player, n, k));
  } catch (err) { send(res, err); }
});

// ---------------------------------------------------------------------------
// signed-in students (the chat-screen banner)
// ---------------------------------------------------------------------------

/** First name + last initial, from the account — the same shape the code-join form asks for. */
function accountName(u) {
  const first = String((u && u.firstName) || '').trim();
  const last = String((u && u.lastName) || '').trim();
  return [first, last ? `${last[0]}.` : ''].filter(Boolean).join(' ') || 'Player';
}

/**
 * Games open right now in any class I'm enrolled in. The chat banner polls this. A game this
 * process hasn't seen (hosted before the last deploy) is revived from its snapshot first.
 */
mineRouter.get('/', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    const student = userHasRole(req.user, 'student');
    if (!student) return res.json({ student, name: null, games: [] });
    const inMemory = G.anyClassGames();
    if (!inMemory && !(await store.anyClassGames())) return res.json({ student, name: accountName(req.user), games: [] });
    const classes = await EnrollmentCode.find({ 'enrolledStudents.studentId': req.user._id }, '_id').lean();
    const ids = classes.map((c) => c._id);
    if (!inMemory) await store.loadForClasses(ids);
    res.json({ student, name: accountName(req.user), games: G.gamesForClasses(ids) });
  } catch (err) { send(res, err); }
});

/**
 * Join with my account. Any open game works by code — the class only decides who sees the banner —
 * and a second device or a reload reseats me in the same player. Non-students get 403 and the page
 * falls back to the typed-name form.
 */
mineRouter.post('/join', async (req, res) => {
  try {
    if (!userHasRole(req.user, 'student')) return res.status(403).json({ message: 'Join with the code and your name.' });
    const game = await store.load((req.body || {}).code);
    if (!game) return res.status(404).json({ message: 'No game with that code. Check the board and try again.' });
    const { token, player } = G.join(game, accountName(req.user), { userId: req.user._id });
    res.status(201).json({ token, code: game.code, playerId: player.id, name: player.name, team: player.team });
  } catch (err) { send(res, err); }
});

/** My own math-facts record (the phone shows it after a game). */
mineRouter.get('/fluency',
  logRecordAccess('skill_mastery', 'student_self_access', { getStudentId: (req) => req.user._id }),
  async (req, res) => {
    try {
      res.set('Cache-Control', 'no-store');
      const sum = fluency.summarize(await FactFluency.findOne({ userId: req.user._id }).lean());
      const { rows: _rows, ...rest } = sum;
      res.json({ ...rest, grids: fluency.studentGrid(sum), fluentSec: G.FLUENT_MS / 1000 });
    } catch (err) { send(res, err); }
  });

// ---------------------------------------------------------------------------
// solo practice (public): a hub's games, and a round's plays
// ---------------------------------------------------------------------------

// A student pulls one batch every ~40 plays, plus the hub; a whole school shares one IP.
const soloLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, max: 3000, keyGenerator: (req) => req.ip,
  standardHeaders: true, legacyHeaders: false,
  message: { message: 'Too many requests from this network. Wait a moment and try again.' },
});
soloRouter.use(soloLimiter);

soloRouter.get('/hubs', (req, res) => res.json({ hubs: solo.hubList() }));

/** Find a game and playbook by skill or topic ("completing the square", "SOHCAHTOA", "box plots").
 *  Public like the rest of solo practice: it reads only the banks' own titles and blurbs. Both the
 *  host's picker and the solo page use it, so a teacher and a student get the same answer. */
soloRouter.get('/search', (req, res) => {
  try {
    const q = String(req.query.q || '').slice(0, drillSearch.MAX_Q);
    res.set('Cache-Control', 'public, max-age=300');
    res.json({ q, results: drillSearch.search(q) });
  } catch (err) { send(res, err); }
});

soloRouter.get('/hubs/:hub', (req, res) => {
  try {
    const view = solo.hubView(req.params.hub);
    if (!view) return res.status(404).json({ message: 'No such course.' });
    res.json(view);
  } catch (err) { send(res, err); }
});

soloRouter.get('/plays', (req, res) => {
  try {
    const q = solo.parseDeal(req.query);
    if (q.error) return res.status(400).json({ message: q.error });
    res.set('Cache-Control', 'no-store');
    res.json({ from: q.from, plays: solo.deal(q.drill, q.playbook, q.seed, q.from, solo.BATCH, q.focus) });
  } catch (err) { send(res, err); }
});

// ---------------------------------------------------------------------------
// Solo rounds saved to an account
// ---------------------------------------------------------------------------

/** The selection a round was played at — the same four things the page's own
 *  localStorage key is built from, so "your best here" means the same thing
 *  whether it came from this browser or from the account. */
function selectionOf(src) {
  const focus = String(src.focus || '')
    .split(',').map((n) => parseInt(n, 10)).filter(Number.isInteger).slice(0, FOCUS_MAX);
  return {
    drill: String(src.drill || '').slice(0, 40),
    playbook: String(src.book || src.playbook || '').slice(0, 60),
    seconds: Math.max(0, Math.min(3600, parseInt(src.seconds, 10) || 0)),
    focus: focus.sort((x, y) => x - y),
  };
}

const isStudent = (user) => !!user && userHasRole(user, 'student');

/** Whoever is asking, and — if they are signed in — their best at one selection.
 *  Public on purpose: a guest gets {signedIn:false} rather than a 401, because
 *  the page asks this before it knows whether there is anyone to ask about. */
soloRouter.get('/me', async (req, res) => {
  const signedIn = !!(req.isAuthenticated && req.isAuthenticated() && req.user);
  if (!signedIn) return res.json({ signedIn: false, saves: false, best: null });
  const out = {
    signedIn: true,
    firstName: req.user.firstName || req.user.username || '',
    saves: isStudent(req.user),
    best: null,
  };
  if (!out.saves || !req.query.drill) return res.json(out);
  try {
    const sel = selectionOf(req.query);
    const best = await DrillResult.findOne({
      userId: req.user._id, drill: sel.drill, playbook: sel.playbook,
      seconds: sel.seconds, focus: sel.focus,
    }).sort({ score: -1 }).lean();
    if (best) {
      out.best = { score: best.score, right: best.right, attempted: best.attempted, playedAt: best.playedAt };
    }
    out.rounds = await DrillResult.countDocuments({ userId: req.user._id });
    res.json(out);
  } catch (err) {
    // A history we cannot read must not stop anyone playing.
    logger.error('solo /me failed', { error: err.message });
    res.json(out);
  }
});

/** File one finished round. Students only, for the same reason FactFluency is:
 *  this is a student education record, and an adult account has no business
 *  accumulating one. A signed-in non-student gets saved:false, not an error. */
soloRouter.post('/result', async (req, res) => {
  if (!(req.isAuthenticated && req.isAuthenticated() && req.user)) {
    return res.status(401).json({ message: 'Sign in to save your results.' });
  }
  if (!isStudent(req.user)) return res.json({ saved: false, reason: 'not-a-student' });
  try {
    const body = req.body || {};
    const sel = selectionOf(body);
    // The drill has to be a game we actually offer; otherwise a typo (or a
    // script) could file rounds under names no teacher view will ever show.
    if (!sel.drill || !solo.onAHub(sel.drill)) {
      return res.status(400).json({ message: 'No such game.' });
    }
    const hub = String(body.hub || '').slice(0, 40);
    if (!Object.hasOwn(solo.HUBS, hub)) return res.status(400).json({ message: 'No such course.' });

    const num = (v, max) => {
      const n = Math.floor(Number(v));
      return Number.isFinite(n) && n >= 0 && n <= max ? n : null;
    };
    const score = num(body.score, 100000);
    const right = num(body.right, 10000);
    const attempted = num(body.attempted, 10000);
    const streak = num(body.streak, 10000) ?? 0;
    if (score === null || right === null || attempted === null) {
      return res.status(400).json({ message: 'That is not a finished round.' });
    }
    // Self-reported numbers that disagree with themselves are the one lie worth
    // refusing outright: it is the shape that would poison an average.
    if (right > attempted) return res.status(400).json({ message: 'That is not a finished round.' });

    await DrillResult.create({
      userId: req.user._id, hub, ...sel, score, right, attempted, streak, playedAt: new Date(),
    });
    const best = await DrillResult.findOne({
      userId: req.user._id, drill: sel.drill, playbook: sel.playbook,
      seconds: sel.seconds, focus: sel.focus,
    }).sort({ score: -1 }).lean();
    res.json({
      saved: true,
      best: best ? { score: best.score, right: best.right, attempted: best.attempted } : null,
    });
  } catch (err) {
    logger.error('solo /result failed', { error: err.message });
    res.status(500).json({ message: 'Could not save that round.' });
  }
});

/** For config/middleware.js: player and solo calls are exempt from the global apiLimiter. */
const LIVE_DRILL_PLAY_PATH = /^\/live-drill\/(play|solo)\//;
function isLiveDrillPlayPath(apiPath) { return LIVE_DRILL_PLAY_PATH.test(String(apiPath || '')); }

module.exports = { hostRouter, playRouter, mineRouter, soloRouter, isLiveDrillPlayPath, TOKEN_HEADER, _accountName: accountName };
