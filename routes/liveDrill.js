/**
 * Live Two-Minute Drill — a whole-class game with a join code.
 *
 *   /api/live-drill/host/*  teacher only (isAuthenticated + isTeacher, CSRF as usual)
 *   /api/live-drill/play/*  PUBLIC: students join with a code and a name, no account. A player
 *                           is a bearer token (X-Live-Drill-Token header; `?t=` on the SSE
 *                           stream, which can't send headers). CSRF-exempt — nothing here rides
 *                           a cookie — and off the global apiLimiter, because a whole class
 *                           shares one school IP; `playLimiter` keys on the token instead.
 *   /api/live-drill/mine/*  signed-in students (isAuthenticated, CSRF as usual): the chat-screen
 *                           banner asks which of MY classes has a game open, and joins with the
 *                           account's name — no code, nothing typed.
 *
 * The game itself — rules, scoring, what each screen may see — is utils/liveDrill/games.js.
 * Pages: public/live-drill-host.html (projector), public/play.html (students, at /play).
 */
const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const QRCode = require('qrcode');
const EnrollmentCode = require('../models/enrollmentCode');
const { userHasRole } = require('../utils/roleQuery');
const logger = require('../utils/logger').child({ route: 'liveDrill' });
const G = require('../utils/liveDrill/games');
const { DRILLS, listPlaybooks } = require('../utils/liveDrill/engine');
const { FOCUSABLE, FOCUS_MAX } = require('../utils/liveDrill/facts');

const hostRouter = express.Router();
const playRouter = express.Router();
const mineRouter = express.Router();

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
        if (d.native) out.focusable = { books: FOCUSABLE, max: FOCUS_MAX }; // Math Facts: pick the numbers
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

hostRouter.get('/games/:code/stream', (req, res) => {
  try {
    const game = G.hostGame(req.params.code, req.user._id);
    openStream(req, res, game, { kind: 'host' });
  } catch (err) { send(res, err); }
});

hostRouter.get('/games/:code', (req, res) => {
  try { res.json(G.hostView(G.hostGame(req.params.code, req.user._id))); } catch (err) { send(res, err); }
});

const hostAction = (fn) => (req, res) => {
  try {
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

playRouter.post('/join', joinLimiter, (req, res) => {
  try {
    const { code, name } = req.body || {};
    const game = G.getGame(code);
    if (!game) return res.status(404).json({ message: 'No game with that code. Check the board and try again.' });
    const { token, player } = G.join(game, name);
    res.status(201).json({ token, code: game.code, playerId: player.id, name: player.name, team: player.team });
  } catch (err) { send(res, err); }
});

function withPlayer(req) {
  const game = G.getGame(req.params.code);
  if (!game) throw new G.GameError(404, 'That game has ended.');
  const player = G.playerFor(game, req.get(TOKEN_HEADER) || req.query.t);
  return { game, player };
}

playRouter.get('/:code/stream', playLimiter, (req, res) => {
  try {
    const { game, player } = withPlayer(req);
    openStream(req, res, game, { kind: 'player', playerId: player.id });
  } catch (err) { send(res, err); }
});

playRouter.get('/:code/state', playLimiter, (req, res) => {
  try {
    const { game, player } = withPlayer(req);
    res.json(G.playerView(game, player));
  } catch (err) { send(res, err); }
});

playRouter.get('/:code/play', playLimiter, (req, res) => {
  try {
    const { game, player } = withPlayer(req);
    res.set('Cache-Control', 'no-store');
    res.json(G.currentPlay(game, player));
  } catch (err) { send(res, err); }
});

playRouter.post('/:code/answer', playLimiter, (req, res) => {
  try {
    const { game, player } = withPlayer(req);
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
 * Games open right now in any class I'm enrolled in. The chat banner polls this, so the common
 * case — no class game anywhere on the server — answers from memory without touching the DB.
 */
mineRouter.get('/', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    const student = userHasRole(req.user, 'student');
    if (!student || !G.anyClassGames()) return res.json({ student, name: student ? accountName(req.user) : null, games: [] });
    const classes = await EnrollmentCode.find({ 'enrolledStudents.studentId': req.user._id }, '_id').lean();
    res.json({ student, name: accountName(req.user), games: G.gamesForClasses(classes.map((c) => c._id)) });
  } catch (err) { send(res, err); }
});

/**
 * Join with my account. Any open game works by code — the class only decides who sees the banner —
 * and a second device or a reload reseats me in the same player. Non-students get 403 and the page
 * falls back to the typed-name form.
 */
mineRouter.post('/join', (req, res) => {
  try {
    if (!userHasRole(req.user, 'student')) return res.status(403).json({ message: 'Join with the code and your name.' });
    const game = G.getGame((req.body || {}).code);
    if (!game) return res.status(404).json({ message: 'No game with that code. Check the board and try again.' });
    const { token, player } = G.join(game, accountName(req.user), { userId: req.user._id });
    res.status(201).json({ token, code: game.code, playerId: player.id, name: player.name, team: player.team });
  } catch (err) { send(res, err); }
});

/** For config/middleware.js: player calls are exempt from the global apiLimiter. */
const LIVE_DRILL_PLAY_PATH = /^\/live-drill\/play\//;
function isLiveDrillPlayPath(apiPath) { return LIVE_DRILL_PLAY_PATH.test(String(apiPath || '')); }

module.exports = { hostRouter, playRouter, mineRouter, isLiveDrillPlayPath, TOKEN_HEADER, _accountName: accountName };
