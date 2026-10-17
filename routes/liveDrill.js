/**
 * Live Two-Minute Drill — a whole-class game with a join code.
 *
 *   /api/live-drill/host/*  teacher only (isAuthenticated + isTeacher, CSRF as usual)
 *   /api/live-drill/play/*  PUBLIC: students join with a code and a name, no account. A player
 *                           is a bearer token (X-Live-Drill-Token header; `?t=` on the SSE
 *                           stream, which can't send headers). CSRF-exempt — nothing here rides
 *                           a cookie — and off the global apiLimiter, because a whole class
 *                           shares one school IP; `playLimiter` keys on the token instead.
 *
 * The game itself — rules, scoring, what each screen may see — is utils/liveDrill/games.js.
 * Pages: public/live-drill-host.html (projector), public/play.html (students, at /play).
 */
const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger').child({ route: 'liveDrill' });
const G = require('../utils/liveDrill/games');
const { DRILLS, listPlaybooks } = require('../utils/liveDrill/engine');

const hostRouter = express.Router();
const playRouter = express.Router();

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
      try { return { id, title: d.title, playbooks: listPlaybooks(id) }; } catch (e) {
        logger.error('drill bank unreadable', { drill: id, error: e.message });
        return { id, title: d.title, playbooks: [], unavailable: true };
      }
    });
    res.json({ drills, settings: G.SETTINGS });
  } catch (err) { send(res, err); }
});

hostRouter.post('/games', (req, res) => {
  try {
    const { drill, playbook, mode, seconds, plays, secondsPerPlay } = req.body || {};
    const game = G.createGame({ hostId: req.user._id, drill, playbook, mode, seconds, plays, secondsPerPlay });
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

/** For config/middleware.js: player calls are exempt from the global apiLimiter. */
const LIVE_DRILL_PLAY_PATH = /^\/live-drill\/play\//;
function isLiveDrillPlayPath(apiPath) { return LIVE_DRILL_PLAY_PATH.test(String(apiPath || '')); }

module.exports = { hostRouter, playRouter, isLiveDrillPlayPath, TOKEN_HEADER };
