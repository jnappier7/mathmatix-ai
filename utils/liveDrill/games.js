/**
 * Live Two-Minute Drill — the game.
 *
 * A teacher hosts; students join with a code. Two teams (Red, Blue) share one field and the
 * answers of everyone on a team move that team's ball. Two modes, one rulebook:
 *
 *   drive  — the drill as students know it, played by the whole class at once. One shared
 *            2:00 clock; each student plays at their own pace. The projector shows the field,
 *            never a question (everyone is on a different play).
 *   huddle — Kahoot-style. The projector shows one play; every student answers it on their
 *            device inside a per-play window; the reveal shows how the class split and the tell.
 *            The teacher advances.
 *
 * The server deals and grades every play (utils/liveDrill/engine.js regenerates play n from
 * the game seed), stamps every clock, and never sends an open play's answer. A student's
 * device only ever reports "I picked key k on play n" — it cannot claim yards.
 *
 * STATE IS IN MEMORY, by design. A game lives ~10 minutes and the app already runs as one
 * instance (the per-user chat lock in routes/chat.js is in-memory too). A deploy mid-game ends
 * it. If the service is ever scaled out, games need a shared store before this works — players
 * and host must land on the instance that holds their game.
 *
 * Privacy: a player is a display name the student types plus a random bearer token (only its
 * hash is kept). No account, no persistence; a game and everything in it is dropped an hour
 * after it ends (or after two idle hours).
 */
const crypto = require('crypto');
const { dealPlay, publicPlay, RECENT, DRILLS, getDrill } = require('./engine');

const START_POS = 25;
const TD_POINTS = 7;
const SACK = 5;
const MAX_PLAYERS = 80;
const MAX_GAMES = 500;
const MAX_GAMES_PER_HOST = 3;
const DONE_TTL_MS = 60 * 60 * 1000;
const IDLE_TTL_MS = 2 * 60 * 60 * 1000;
const DRIVE_GRACE_MS = 1500; // an answer in flight when the clock hits 0:00 still counts
// A team's answers are pooled, then scaled so a team moves like ~K players rather than like the
// sum of 15: the ball should move on every answer and still need a drive to score. Teams of
// K or fewer move exactly like a solo player, so a 3-student test game still plays right.
// Calibration: a solo player in the course drill nets ~9 yards a play at ~70% and runs ~20
// plays in 2:00 (~2.5 TDs). K = 2.5 puts a full team at ~6 TDs a drive — every answer visibly
// moves the ball, and touchdowns stay events. Huddle runs ~10 plays all answered at once, so
// K = 3 lands ~3–4 TDs a game.
const TEAM_K = { drive: 2.5, huddle: 3 };
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L
const TEAM_NAMES = ['Red', 'Blue'];

const SETTINGS = {
  drive: { seconds: [60, 120, 180, 300], defaultSeconds: 120 },
  huddle: { plays: [5, 10, 15, 20], defaultPlays: 10, secondsPerPlay: [10, 20, 30, 45], defaultSecondsPerPlay: 20 },
};

const games = new Map(); // code → game

const now = () => Date.now();
const hash = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');

function newCode() {
  for (let tries = 0; tries < 50; tries++) {
    let c = '';
    const bytes = crypto.randomBytes(6);
    for (let i = 0; i < 6; i++) c += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    if (!games.has(c)) return c;
  }
  throw new Error('could not mint a game code');
}

function normalizeCode(code) {
  return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

/** A display name: printable, no markup, short, and unique within the game. */
function cleanName(raw, game) {
  let name = String(raw || '')
    .normalize('NFKC')
    // control, format (zero-width, bidi overrides) and line/paragraph separators, plus markup
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}<>&"'`\\]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 20)
    .trim();
  if (!name) return null;
  const taken = new Set([...game.players.values()].map((p) => p.name.toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;
  for (let i = 2; i < 100; i++) {
    const n = `${name.slice(0, 17)} ${i}`;
    if (!taken.has(n.toLowerCase())) return n;
  }
  return null;
}

// ---------------------------------------------------------------------------
// create / lookup
// ---------------------------------------------------------------------------

class GameError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function createGame({ hostId, drill, playbook, mode, seconds, plays, secondsPerPlay }) {
  if (!DRILLS[drill]) throw new GameError(400, 'Unknown drill.');
  if (mode !== 'drive' && mode !== 'huddle') throw new GameError(400, 'Mode must be drive or huddle.');
  const d = getDrill(drill); // throws if the published page can't be read
  const book = d.bank.BOOKS[playbook] ? playbook : 'all';
  sweep();
  if (games.size >= MAX_GAMES) throw new GameError(503, 'Too many live games right now. Try again in a few minutes.');
  const mine = [...games.values()].filter((g) => g.hostId === String(hostId) && g.phase !== 'over');
  if (mine.length >= MAX_GAMES_PER_HOST) {
    // A teacher who closed the tab and hosted again shouldn't be locked out: retire the oldest.
    mine.sort((a, b) => a.createdAt - b.createdAt);
    endGame(mine[0]);
  }

  const pickOr = (v, allowed, dflt) => (allowed.includes(Number(v)) ? Number(v) : dflt);
  const game = {
    code: newCode(),
    hostId: String(hostId),
    drill,
    drillTitle: d.title,
    playbook: book,
    playbookName: d.bank.BOOKS[book].name,
    mode,
    seed: crypto.randomBytes(12).toString('hex'),
    createdAt: now(),
    touchedAt: now(),
    phase: 'lobby', // lobby → live → (huddle: reveal ↔ live) → over
    seconds: pickOr(seconds, SETTINGS.drive.seconds, SETTINGS.drive.defaultSeconds),
    totalPlays: pickOr(plays, SETTINGS.huddle.plays, SETTINGS.huddle.defaultPlays),
    secondsPerPlay: pickOr(secondsPerPlay, SETTINGS.huddle.secondsPerPlay, SETTINGS.huddle.defaultSecondsPerPlay),
    teams: TEAM_NAMES.map((name) => ({ name, pos: START_POS, pts: 0, tds: 0, yards: 0 })),
    players: new Map(), // playerId → player
    byToken: new Map(), // token hash → playerId
    deck: [], // dealt plays, index = play number - 1
    startedAt: null,
    endsAt: null,
    endedAt: null,
    round: null, // huddle: { n, openedAt, closesAt, answers: Map(playerId → result), closed }
    feed: [],
    misses: new Map(), // template id → { id, count, n, picks: Map(k → count) }
    timers: new Set(),
    listeners: new Set(),
    version: 0,
  };
  games.set(game.code, game);
  return game;
}

function getGame(code) {
  const g = games.get(normalizeCode(code));
  return g || null;
}

function hostGame(code, hostId) {
  const g = getGame(code);
  if (!g || g.hostId !== String(hostId)) throw new GameError(404, 'Game not found.');
  return g;
}

function playerFor(game, token) {
  const id = token && game.byToken.get(hash(token));
  const p = id && game.players.get(id);
  if (!p || p.kicked) throw new GameError(401, 'You are not in this game. Join again with the code.');
  return p;
}

// ---------------------------------------------------------------------------
// the deck
// ---------------------------------------------------------------------------

/** Play n (1-based). Dealt in order, so each play's "recent" list is the same for everyone. */
function playAt(game, n) {
  while (game.deck.length < n) {
    const i = game.deck.length + 1;
    const recent = game.deck.slice(-RECENT).map((p) => p.id).reverse();
    game.deck.push(dealPlay(game.drill, game.playbook, game.seed, i, recent));
  }
  return game.deck[n - 1];
}

// ---------------------------------------------------------------------------
// lobby
// ---------------------------------------------------------------------------

function join(game, rawName) {
  if (game.phase === 'over') throw new GameError(409, 'That game is over.');
  const active = [...game.players.values()].filter((p) => !p.kicked);
  if (active.length >= MAX_PLAYERS) throw new GameError(409, 'This game is full.');
  const name = cleanName(rawName, game);
  if (!name) throw new GameError(400, 'Type your name (first name and last initial).');
  // Balance the teams as people arrive: join the smaller side, Red on a tie.
  const sizes = teamSizes(game);
  const team = sizes[1] < sizes[0] ? 1 : 0;
  const token = crypto.randomBytes(24).toString('base64url');
  const player = {
    id: crypto.randomBytes(8).toString('hex'),
    name,
    team,
    joinedAt: now(),
    kicked: false,
    att: 0, comp: 0, yards: 0, streak: 0, best: 0,
    n: 1, issuedAt: null, // drive: the play they're on, and when it was first shown to them
    misses: [], // { n, k }
    lastSeen: now(),
  };
  game.players.set(player.id, player);
  game.byToken.set(hash(token), player.id);
  touch(game);
  return { token, player };
}

function teamSizes(game) {
  const s = [0, 0];
  for (const p of game.players.values()) if (!p.kicked) s[p.team]++;
  return s;
}

function kick(game, playerId) {
  const p = game.players.get(String(playerId));
  if (!p) throw new GameError(404, 'No such player.');
  p.kicked = true;
  for (const l of game.listeners) {
    if (l.playerId === p.id) { safeWrite(l.res, 'kicked', {}); l.res.end(); game.listeners.delete(l); }
  }
  touch(game);
}

function setTeam(game, playerId, team) {
  const p = game.players.get(String(playerId));
  if (!p || p.kicked) throw new GameError(404, 'No such player.');
  if (game.phase !== 'lobby') throw new GameError(409, 'Teams lock at kickoff.');
  p.team = team === 1 ? 1 : 0;
  touch(game);
}

// ---------------------------------------------------------------------------
// scoring
// ---------------------------------------------------------------------------

/** Move a team's ball by one player's gain (scaled for team size). Returns true on a TD. */
function moveTeam(game, teamIdx, gain) {
  const t = game.teams[teamIdx];
  const size = Math.max(1, teamSizes(game)[teamIdx]);
  const k = TEAM_K[game.mode];
  const scaled = gain * Math.min(k, size) / size;
  t.yards += scaled;
  t.pos += scaled;
  if (t.pos >= 100) {
    t.pts += TD_POINTS; t.tds++; t.pos = START_POS;
    return true;
  }
  t.pos = Math.max(1, t.pos);
  return false;
}

function speedGain(ms, windowMs) {
  if (windowMs) return ms <= windowMs / 3 ? 15 : ms <= (2 * windowMs) / 3 ? 10 : 5;
  return ms <= 6000 ? 15 : ms <= 12000 ? 10 : 5; // the drill's own thresholds
}

function recordMiss(game, play, n, k) {
  let m = game.misses.get(play.id);
  if (!m) { m = { id: play.id, count: 0, n, picks: new Map() }; game.misses.set(play.id, m); }
  m.count++;
  m.n = n; // keep the latest example
  m.picks.set(k, (m.picks.get(k) || 0) + 1);
}

function pushFeed(game, item) {
  game.feed.unshift({ at: now(), ...item });
  if (game.feed.length > 14) game.feed.length = 14;
}

function applyAnswer(game, player, play, n, k, ms, windowMs) {
  const ok = k === play.answer;
  player.att++;
  let gain;
  if (ok) {
    player.comp++; player.streak++; player.best = Math.max(player.best, player.streak);
    gain = speedGain(ms, windowMs);
  } else {
    player.streak = 0;
    gain = -SACK;
    player.misses.push({ n, k });
    recordMiss(game, play, n, k);
  }
  player.yards += gain;
  const td = moveTeam(game, player.team, gain);
  return { ok, gain, td };
}

// ---------------------------------------------------------------------------
// flow
// ---------------------------------------------------------------------------

function later(game, ms, fn) {
  const t = setTimeout(() => { game.timers.delete(t); fn(); }, Math.max(0, ms));
  if (t.unref) t.unref();
  game.timers.add(t);
}

function start(game) {
  if (game.phase !== 'lobby') throw new GameError(409, 'This game has already kicked off.');
  if (!teamSizes(game).some(Boolean)) throw new GameError(409, 'Nobody has joined yet.');
  game.startedAt = now();
  if (game.mode === 'drive') {
    game.phase = 'live';
    game.endsAt = game.startedAt + game.seconds * 1000;
    later(game, game.endsAt - now() + DRIVE_GRACE_MS, () => endGame(game));
    pushFeed(game, { type: 'kickoff' });
    touch(game);
  } else {
    openRound(game, 1);
  }
}

function openRound(game, n) {
  playAt(game, n);
  game.phase = 'live';
  const openedAt = now();
  game.round = { n, openedAt, closesAt: openedAt + game.secondsPerPlay * 1000, answers: new Map(), closed: false };
  const round = game.round;
  later(game, game.secondsPerPlay * 1000 + 300, () => { if (game.round === round) closeRound(game); });
  touch(game);
}

function closeRound(game) {
  const r = game.round;
  if (!r || r.closed) return;
  r.closed = true;
  const play = playAt(game, r.n);
  const windowMs = game.secondsPerPlay * 1000;
  // Score in answer order so the feed reads like the play happened.
  const ordered = [...r.answers.entries()].sort((a, b) => a[1].ms - b[1].ms);
  const teamGain = [0, 0];
  const tds = [0, 0];
  for (const [pid, a] of ordered) {
    const p = game.players.get(pid);
    if (!p || p.kicked) continue;
    const res = applyAnswer(game, p, play, r.n, a.k, a.ms, windowMs);
    Object.assign(a, res);
    teamGain[p.team] += res.gain;
    if (res.td) tds[p.team]++;
  }
  // Silence is not a sack: a student who didn't answer simply didn't move the ball.
  for (const [i, t] of game.teams.entries()) {
    if (tds[i]) pushFeed(game, { type: 'td', team: i, text: `TOUCHDOWN ${t.name.toUpperCase()}` });
  }
  game.phase = 'reveal';
  touch(game);
}

function advance(game) {
  if (game.mode !== 'huddle') throw new GameError(409, 'Only Huddle games advance play by play.');
  if (game.phase === 'live') { closeRound(game); return; }
  if (game.phase !== 'reveal') throw new GameError(409, 'Nothing to advance.');
  if (game.round.n >= game.totalPlays) { endGame(game); return; }
  openRound(game, game.round.n + 1);
}

function endGame(game) {
  if (game.phase === 'over') return;
  if (game.mode === 'huddle' && game.phase === 'live') closeRound(game);
  game.phase = 'over';
  game.endedAt = now();
  for (const t of game.timers) clearTimeout(t);
  game.timers.clear();
  touch(game);
}

// ---------------------------------------------------------------------------
// player actions
// ---------------------------------------------------------------------------

/** Drive: the play this player is on. Its clock starts the first time it is fetched. */
function currentPlay(game, player) {
  if (game.mode !== 'drive' || game.phase !== 'live') throw new GameError(409, 'No play is open.');
  const play = playAt(game, player.n);
  if (!player.issuedAt) player.issuedAt = now();
  player.lastSeen = now();
  return { n: player.n, play: publicPlay(play) };
}

function answer(game, player, n, k) {
  n = Number(n); k = String(k);
  player.lastSeen = now();
  if (game.mode === 'drive') {
    if (game.phase !== 'live' || now() > game.endsAt + DRIVE_GRACE_MS) throw new GameError(409, 'The clock has run out.');
    if (n !== player.n || !player.issuedAt) throw new GameError(409, 'That play is already over.');
    const play = playAt(game, n);
    if (!play.choices.some((c) => c.k === k)) throw new GameError(400, 'Not one of the choices.');
    const ms = now() - player.issuedAt;
    const res = applyAnswer(game, player, play, n, k, ms);
    player.n++; player.issuedAt = null;
    if (res.td) pushFeed(game, { type: 'td', team: player.team, text: `TOUCHDOWN ${game.teams[player.team].name.toUpperCase()}`, who: player.name });
    else if (res.ok && res.gain === 15) pushFeed(game, { type: 'big', team: player.team, who: player.name, gain: res.gain });
    else if (!res.ok) pushFeed(game, { type: 'sack', team: player.team, who: player.name });
    touch(game);
    return { ...res, ms, n, answer: play.answer, answerHtml: play.answerHtml, tell: play.tell, revealCard: play.revealCard, picked: k };
  }
  // huddle
  const r = game.round;
  if (game.phase !== 'live' || !r || r.closed || n !== r.n) throw new GameError(409, 'That play is closed.');
  if (r.answers.has(player.id)) throw new GameError(409, 'You already answered this play.');
  const play = playAt(game, n);
  if (!play.choices.some((c) => c.k === k)) throw new GameError(400, 'Not one of the choices.');
  const ms = now() - r.openedAt;
  r.answers.set(player.id, { k, ms });
  // Close as soon as every player in the game has answered — no waiting out the clock.
  const everyone = [...game.players.values()].filter((p) => !p.kicked);
  if (everyone.every((p) => r.answers.has(p.id))) closeRound(game);
  else touch(game);
  return { locked: true, n };
}

// ---------------------------------------------------------------------------
// views (what each screen is allowed to see)
// ---------------------------------------------------------------------------

function teamsView(game) {
  const sizes = teamSizes(game);
  return game.teams.map((t, i) => ({ name: t.name, pos: Math.round(t.pos * 10) / 10, pts: t.pts, tds: t.tds, size: sizes[i] }));
}

function base(game) {
  return {
    code: game.code,
    drill: game.drill,
    drillTitle: game.drillTitle,
    playbookName: game.playbookName,
    mode: game.mode,
    phase: game.phase,
    serverNow: now(),
    seconds: game.seconds,
    endsAt: game.endsAt,
    totalPlays: game.totalPlays,
    secondsPerPlay: game.secondsPerPlay,
    teams: teamsView(game),
    version: game.version,
  };
}

function roundView(game, forHost) {
  const r = game.round;
  if (!r) return null;
  const play = playAt(game, r.n);
  const v = { n: r.n, openedAt: r.openedAt, closesAt: r.closesAt, closed: r.closed, answered: r.answers.size, play: publicPlay(play) };
  if (r.closed) {
    const counts = Object.fromEntries(play.choices.map((c) => [c.k, 0]));
    const right = [0, 0];
    for (const [pid, a] of r.answers) {
      counts[a.k] = (counts[a.k] || 0) + 1;
      const p = game.players.get(pid);
      if (p && a.ok) right[p.team]++;
    }
    Object.assign(v, { answer: play.answer, answerHtml: play.answerHtml, tell: play.tell, revealCard: play.revealCard, counts, rightByTeam: right });
  } else if (forHost) {
    v.answeredByTeam = [0, 0];
    for (const pid of r.answers.keys()) { const p = game.players.get(pid); if (p) v.answeredByTeam[p.team]++; }
  }
  return v;
}

/** The class film room: most-missed plays, each with one example and how the misses split. */
function filmRoom(game, limit = 3) {
  return [...game.misses.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map((m) => {
      const play = playAt(game, m.n);
      const label = (k) => (play.choices.find((c) => c.k === k) || {}).html || k;
      const top = [...m.picks.entries()].sort((a, b) => b[1] - a[1])[0];
      return { id: m.id, count: m.count, playbookName: play.playbookName, head: play.head, card: play.revealCard,
        answerHtml: play.answerHtml, tell: play.tell, commonPick: top ? { html: label(top[0]), count: top[1] } : null };
    });
}

function hostView(game) {
  const players = [...game.players.values()].filter((p) => !p.kicked).map((p) => ({
    id: p.id, name: p.name, team: p.team, att: p.att, comp: p.comp, yards: p.yards, best: p.best,
  }));
  const v = { ...base(game), players, feed: game.feed.slice(0, 8), round: roundView(game, true) };
  if (game.phase === 'over') {
    const mvps = [0, 1].map((t) => players.filter((p) => p.team === t && p.att > 0)
      .sort((a, b) => b.yards - a.yards || b.comp - a.comp).slice(0, 3)
      .map((p) => ({ name: p.name, yards: p.yards, comp: p.comp, att: p.att })));
    const att = players.reduce((s, p) => s + p.att, 0);
    const comp = players.reduce((s, p) => s + p.comp, 0);
    v.final = { mvps, film: filmRoom(game), att, comp, pct: att ? Math.round((100 * comp) / att) : 0 };
  }
  return v;
}

function playerView(game, player) {
  const v = {
    ...base(game),
    me: { id: player.id, name: player.name, team: player.team, att: player.att, comp: player.comp,
      yards: player.yards, streak: player.streak, best: player.best, n: player.n },
  };
  if (game.mode === 'huddle' && game.round) {
    const rv = roundView(game, false);
    const mine = game.round.answers.get(player.id);
    rv.mine = mine ? (game.round.closed ? { k: mine.k, ok: !!mine.ok, gain: mine.gain || 0 } : { k: mine.k }) : null;
    delete rv.answered;
    v.round = rv;
  }
  if (game.phase === 'over') {
    v.film = player.misses.slice(-12).map(({ n, k }) => {
      const play = playAt(game, n);
      return { head: play.head, card: play.revealCard, answerHtml: play.answerHtml, tell: play.tell,
        pickedHtml: (play.choices.find((c) => c.k === k) || {}).html || k };
    });
  }
  return v;
}

// ---------------------------------------------------------------------------
// live updates (SSE fan-out, coalesced)
// ---------------------------------------------------------------------------

function safeWrite(res, event, data) {
  try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch { /* socket gone */ }
}

function broadcast(game) {
  game.pending = false;
  for (const l of game.listeners) {
    if (l.kind === 'host') safeWrite(l.res, 'state', hostView(game));
    else {
      const p = game.players.get(l.playerId);
      if (p && !p.kicked) safeWrite(l.res, 'state', playerView(game, p));
    }
  }
}

/** State changed: bump the version and push to every screen, at most ~4× a second. */
function touch(game) {
  game.version++;
  game.touchedAt = now();
  if (game.pending) return;
  game.pending = true;
  const t = setTimeout(() => broadcast(game), 250);
  if (t.unref) t.unref();
}

function subscribe(game, listener) {
  game.listeners.add(listener);
  const p = listener.playerId && game.players.get(listener.playerId);
  safeWrite(listener.res, 'state', listener.kind === 'host' ? hostView(game) : playerView(game, p));
  return () => game.listeners.delete(listener);
}

// ---------------------------------------------------------------------------
// housekeeping
// ---------------------------------------------------------------------------

function dropGame(game) {
  for (const t of game.timers) clearTimeout(t);
  for (const l of game.listeners) { try { l.res.end(); } catch { /* gone */ } }
  games.delete(game.code);
}

function sweep() {
  const t = now();
  for (const g of games.values()) {
    if ((g.phase === 'over' && t - g.endedAt > DONE_TTL_MS) || t - g.touchedAt > IDLE_TTL_MS) dropGame(g);
  }
}
const sweeper = setInterval(sweep, 5 * 60 * 1000);
if (sweeper.unref) sweeper.unref();

function _reset() { for (const g of [...games.values()]) dropGame(g); }

module.exports = {
  SETTINGS, TEAM_K, START_POS, GameError,
  createGame, getGame, hostGame, playerFor, normalizeCode,
  join, kick, setTeam, start, advance, endGame, currentPlay, answer,
  hostView, playerView, subscribe, playAt,
  _reset, _games: games,
};
