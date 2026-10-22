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
const facts = require('./facts');
const hill = require('./hill');

const MODES = ['drive', 'huddle', 'hill'];
/** Team Drive and King of the Hill: everyone at their own pace against one clock. */
const ownPace = (game) => game.mode === 'drive' || game.mode === 'hill';

const START_POS = 25;
const TD_POINTS = 7;
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
// A fact takes seconds, not half a minute: Huddle runs more plays on a shorter clock.
const FACT_SETTINGS = {
  drive: SETTINGS.drive,
  huddle: { plays: [10, 15, 20, 30], defaultPlays: 15, secondsPerPlay: [6, 10, 15], defaultSecondsPerPlay: 10 },
};
// A test-prep play is a whole test question — 15 to 45 seconds, not 3 — so longer clocks.
const PREP_SETTINGS = {
  drive: { seconds: [180, 300, 420, 600], defaultSeconds: 300 },
  huddle: { plays: [5, 10, 15, 20], defaultPlays: 10, secondsPerPlay: [20, 30, 45, 60], defaultSecondsPerPlay: 45 },
};
const settingsFor = (drill) => ({ facts: FACT_SETTINGS, prep: PREP_SETTINGS })[(DRILLS[drill] || {}).scoring] || SETTINGS;

// What a play pays. Standard is the course drill's own (+15/+10/+5 at 6 s/12 s, sack −5). Facts
// come about three times as fast, so each pays about a third as much: a two-minute drive covers
// about the same ground in either drill, and touchdowns stay events. Both keep a blind guess
// worth nothing on average (¼ × 15 = ¾ × 5), which typed answers don't need but cost nothing.
// Huddle splits the play clock into thirds for the same three tiers.
const SCORING = {
  standard: { gains: [15, 10, 5], driveMs: [6000, 12000], sack: 5 },
  facts: { gains: [6, 4, 2], driveMs: [3000, 6000], sack: 2 },
  prep: { gains: [15, 10, 5], driveMs: [20000, 40000], sack: 5 },
};
const scoringFor = (game) => SCORING[(DRILLS[game.drill] || {}).scoring] || SCORING.standard;
// Fact fluency: a right answer in this long or less counts as automatic — the usual 3-second bar.
const FLUENT_MS = 3000;

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

/**
 * `cls` (optional) ties the game to one of the host's classes ({ id, name }): every student enrolled
 * in it sees a "Join" banner on their chat screen (routes/liveDrill.js /mine) and joins with their
 * account name. The code still works for anyone, so a guest device is never locked out.
 */
function createGame({ hostId, hostName, cls, drill, playbook, mode, seconds, plays, secondsPerPlay, focus }) {
  if (!DRILLS[drill]) throw new GameError(400, 'Unknown drill.');
  if (!MODES.includes(mode)) throw new GameError(400, 'Mode must be drive, huddle or hill.');
  const d = getDrill(drill); // throws if the published page can't be read
  const book = d.bank.BOOKS[playbook] ? playbook : 'all';
  // Math Facts only: the numbers the teacher singled out ("× 2s, 5s & 10s").
  const fx = DRILLS[drill].focus && facts.FOCUSABLE.includes(book) ? facts.normalizeFocus(focus) : null;
  const S = settingsFor(drill);
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
    hostName: String(hostName || '').slice(0, 60),
    classId: cls && cls.id ? String(cls.id) : null,
    className: cls && cls.name ? String(cls.name).slice(0, 60) : null,
    drill,
    drillTitle: d.title,
    playbook: book,
    playbookName: d.bank.BOOKS[book].name + (fx ? ` · ${facts.focusLabel(fx)}` : ''),
    focus: fx,
    mode,
    seed: crypto.randomBytes(12).toString('hex'),
    createdAt: now(),
    touchedAt: now(),
    phase: 'lobby', // lobby → live → (huddle: reveal ↔ live) → over
    seconds: pickOr(seconds, S.drive.seconds, S.drive.defaultSeconds),
    totalPlays: pickOr(plays, S.huddle.plays, S.huddle.defaultPlays),
    secondsPerPlay: pickOr(secondsPerPlay, S.huddle.secondsPerPlay, S.huddle.defaultSecondsPerPlay),
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
    playStats: new Map(), // play n → { att, right, picks: Map(k → count) } — the play-by-play
    timers: new Set(),
    listeners: new Set(),
    version: 0,
  };
  if (mode === 'hill') hill.reset(game);
  games.set(game.code, game);
  runHooks(changeHooks, game);
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
    game.deck.push(dealPlay(game.drill, game.playbook, game.seed, i, recent, { focus: game.focus }));
  }
  return game.deck[n - 1];
}

// ---------------------------------------------------------------------------
// lobby
// ---------------------------------------------------------------------------

/**
 * Seat a player. `userId` is set when a signed-in student joins from their account: their name
 * comes from the account (the caller builds it), and joining again — a second device, a reload in
 * a new tab — reseats them in the same player instead of making a second one.
 */
function join(game, rawName, { userId } = {}) {
  if (game.phase === 'over') throw new GameError(409, 'That game is over.');
  if (userId) {
    const seated = [...game.players.values()].find((p) => p.userId === String(userId));
    if (seated && seated.kicked) throw new GameError(403, 'Your teacher removed you from this game.');
    if (seated) {
      const token = crypto.randomBytes(24).toString('base64url');
      game.byToken.set(hash(token), seated.id);
      seated.lastSeen = now();
      return { token, player: seated };
    }
  }
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
    misses: [], msTotal: 0, // { n, k }
    facts: new Map(), // Math Facts: fact id → { label, fam, a, b, att, right, ms: [] } (right answers' times)
    factLog: [], // Math Facts: every answer, in order — the teacher's CSV
    lastSeen: now(),
    userId: userId ? String(userId) : null,
    conns: 0, // open live streams; a player with none is "away" (phone asleep, tab closed)
  };
  if (game.mode === 'hill') hill.resetPlayer(player);
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
  p.conns = 0;
  for (const l of game.listeners) {
    if (l.playerId === p.id) { safeWrite(l.res, 'kicked', {}); l.res.end(); game.listeners.delete(l); }
  }
  if (!maybeCloseRound(game)) touch(game);
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

/**
 * The scoring rules as the screens state them — built from the same constants and thresholds
 * speedTier/moveTeam use, so the lobby can never describe a game the server doesn't play.
 * Speeds are seconds after the play appears: Drive uses the drill's own thresholds (SCORING),
 * Huddle uses thirds of the play clock.
 */
function rulesFor(game) {
  const huddle = game.mode === 'huddle';
  const sc = scoringFor(game);
  const w = huddle ? game.secondsPerPlay : null;
  const sec = (x) => Math.floor(x * 10 + 1e-9) / 10; // round DOWN: "within 6.6 s" must never overpromise
  return {
    speed: [
      { gain: sc.gains[0], within: huddle ? sec(w / 3) : sc.driveMs[0] / 1000 },
      { gain: sc.gains[1], within: huddle ? sec((2 * w) / 3) : sc.driveMs[1] / 1000 },
      { gain: sc.gains[2], within: null },
    ],
    sack: sc.sack,
    typed: !!(DRILLS[game.drill] || {}).typed,
    fluentSec: FLUENT_MS / 1000,
    noAnswer: huddle ? 0 : null, // Drive has no "no answer": the next play waits for you
    teamK: TEAM_K[game.mode] || null,
    hill: game.mode === 'hill' ? hill.rules() : null,
    tdPoints: TD_POINTS,
    startPos: START_POS,
  };
}

/** Which speed tier an answer lands in: 0 fast, 1 steady, 2 slow. */
function speedTier(sc, ms, windowMs) {
  const [t1, t2] = windowMs ? [windowMs / 3, (2 * windowMs) / 3] : sc.driveMs;
  return ms <= t1 ? 0 : ms <= t2 ? 1 : 2;
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

/** Math Facts: one more answer on this student's record for that fact. */
function trackFact(player, play, k, ok, ms) {
  const f = play.fact;
  let rec = player.facts.get(f.id);
  if (!rec) { rec = { label: f.label, fam: f.fam, a: f.a, b: f.b, att: 0, right: 0, ms: [] }; player.facts.set(f.id, rec); }
  rec.att++;
  if (ok) { rec.right++; rec.ms.push(ms); }
  if (player.factLog.length < 600) player.factLog.push({ id: f.id, fact: f.label, answer: play.answer, typed: k, ok, ms });
}

function applyAnswer(game, player, play, n, k, ms, windowMs) {
  const ok = k === play.answer;
  const sc = scoringFor(game);
  player.att++;
  player.msTotal += ms; // for the final scoreboard's average answer time
  let ps = game.playStats.get(n);
  if (!ps) { ps = { att: 0, right: 0, picks: new Map() }; game.playStats.set(n, ps); }
  ps.att++;
  if (ok) ps.right++;
  else ps.picks.set(k, (ps.picks.get(k) || 0) + 1);
  if (play.fact) trackFact(player, play, k, ok, ms);
  let gain;
  let tier = null;
  if (ok) {
    player.comp++; player.streak++; player.best = Math.max(player.best, player.streak);
    tier = speedTier(sc, ms, windowMs);
    gain = sc.gains[tier];
  } else {
    player.streak = 0;
    gain = -sc.sack;
    player.misses.push({ n, k });
    recordMiss(game, play, n, k);
  }
  player.yards += gain;
  // On the hill there is no ball: the climb is settled in hill.onAnswer.
  const td = game.mode === 'hill' ? false : moveTeam(game, player.team, gain);
  return { ok, gain, tier, td };
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
  if (ownPace(game)) {
    game.phase = 'live';
    game.endsAt = game.startedAt + game.seconds * 1000;
    later(game, game.endsAt - now() + DRIVE_GRACE_MS, () => endGame(game));
    pushFeed(game, { type: game.mode === 'hill' ? 'climb' : 'kickoff' });
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

// Called once per finished game (routes/liveDrill.js saves Math Facts fluency to student accounts).
const overHooks = [];
function onGameOver(fn) { overHooks.push(fn); }

function endGame(game) {
  if (game.phase === 'over') return;
  if (game.mode === 'huddle' && game.phase === 'live') closeRound(game);
  if (game.mode === 'hill' && game.phase === 'live') hill.finish(game, now());
  game.phase = 'over';
  game.endedAt = now();
  for (const t of game.timers) clearTimeout(t);
  game.timers.clear();
  touch(game);
  // A game cancelled from the lobby has nothing to save. The hooks run now, synchronously, so they
  // read this game's answers before a "Run it back" can clear them.
  if (game.startedAt) {
    for (const fn of overHooks) {
      try { const r = fn(game); if (r && r.catch) r.catch(() => {}); } catch { /* a hook never breaks the game */ }
    }
  }
}

// ---------------------------------------------------------------------------
// player actions
// ---------------------------------------------------------------------------

/** Drive: the play this player is on. Its clock starts the first time it is fetched. */
function currentPlay(game, player) {
  if (!ownPace(game) || game.phase !== 'live') throw new GameError(409, 'No play is open.');
  const play = playAt(game, player.n);
  if (!player.issuedAt) player.issuedAt = now();
  player.lastSeen = now();
  return { n: player.n, play: publicPlay(play) };
}

/** What a student sent, as the grader compares it — a typed number or one of the choices. */
function readAnswer(play, k) {
  if (play.input === 'number') {
    const v = facts.normalizeTyped(k);
    if (v === null) throw new GameError(400, 'Type a number.');
    return v;
  }
  if (!play.choices.some((c) => c.k === k)) throw new GameError(400, 'Not one of the choices.');
  return k;
}

function answer(game, player, n, k) {
  n = Number(n); k = String(k);
  player.lastSeen = now();
  if (ownPace(game)) {
    if (game.phase !== 'live' || now() > game.endsAt + DRIVE_GRACE_MS) throw new GameError(409, 'The clock has run out.');
    if (n !== player.n || !player.issuedAt) throw new GameError(409, 'That play is already over.');
    const play = playAt(game, n);
    k = readAnswer(play, k);
    const ms = now() - player.issuedAt;
    const res = applyAnswer(game, player, play, n, k, ms);
    player.n++; player.issuedAt = null;
    if (game.mode === 'hill') {
      res.hill = hill.onAnswer(game, player, res, now(), (item) => pushFeed(game, item));
    } else if (res.td) pushFeed(game, { type: 'td', team: player.team, text: `TOUCHDOWN ${game.teams[player.team].name.toUpperCase()}`, who: player.name });
    else if (res.ok && res.tier === 0) pushFeed(game, { type: 'big', team: player.team, who: player.name, gain: res.gain });
    else if (!res.ok) pushFeed(game, { type: 'sack', team: player.team, who: player.name });
    touch(game);
    return { ...res, ms, n, answer: play.answer, answerHtml: play.answerHtml, tell: play.tell, revealCard: play.revealCard, picked: k };
  }
  // huddle
  const r = game.round;
  if (game.phase !== 'live' || !r || r.closed || n !== r.n) throw new GameError(409, 'That play is closed.');
  if (r.answers.has(player.id)) throw new GameError(409, 'You already answered this play.');
  const play = playAt(game, n);
  k = readAnswer(play, k);
  const ms = now() - r.openedAt;
  r.answers.set(player.id, { k, ms });
  if (!maybeCloseRound(game)) touch(game);
  return { locked: true, n };
}

/**
 * Who a Huddle round waits for: the players whose screen is open. A phone that went to sleep or a
 * tab that closed drops its live stream, and a round used to wait out its whole clock for that
 * student every single play. If nobody has a stream open (a test, a polling-only client), it falls
 * back to everyone seated.
 */
function expectedAnswerers(game) {
  const seated = [...game.players.values()].filter((p) => !p.kicked);
  const here = seated.filter((p) => p.conns > 0);
  return here.length ? here : seated;
}

/** Close the open round as soon as everyone it waits for has answered. True if it closed. */
function maybeCloseRound(game) {
  const r = game.round;
  if (game.mode !== 'huddle' || game.phase !== 'live' || !r || r.closed) return false;
  const waitingFor = expectedAnswerers(game);
  if (!waitingFor.length || !waitingFor.every((p) => r.answers.has(p.id))) return false;
  closeRound(game);
  return true;
}

/**
 * "Run it back": the same code, the same teams, the same connected phones — a fresh deal, a clean
 * scoreboard, back to the lobby so the teacher can kick off again. Everyone stays seated; nobody
 * types a code twice.
 */
function rematch(game) {
  if (game.phase !== 'over') throw new GameError(409, 'Finish this game first.');
  game.seed = crypto.randomBytes(12).toString('hex');
  game.deck = [];
  game.teams = TEAM_NAMES.map((name) => ({ name, pos: START_POS, pts: 0, tds: 0, yards: 0 }));
  for (const p of game.players.values()) {
    Object.assign(p, { att: 0, comp: 0, yards: 0, streak: 0, best: 0, n: 1, issuedAt: null, misses: [], msTotal: 0, facts: new Map(), factLog: [] });
  }
  Object.assign(game, { phase: 'lobby', startedAt: null, endsAt: null, endedAt: null, round: null, feed: [], misses: new Map(), playStats: new Map() });
  if (game.mode === 'hill') hill.reset(game);
  game.games = (game.games || 1) + 1;
  touch(game);
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
    className: game.className,
    hostName: game.hostName,
    gameNumber: game.games || 1,
    teams: teamsView(game),
    rules: rulesFor(game),
    version: game.version,
  };
}

function roundView(game, forHost) {
  const r = game.round;
  if (!r) return null;
  const play = playAt(game, r.n);
  const v = { n: r.n, openedAt: r.openedAt, closesAt: r.closesAt, closed: r.closed, answered: r.answers.size, play: publicPlay(play) };
  if (r.closed) {
    // Typed answers have no choices to count against: the counts are whatever the class typed.
    const counts = play.input ? { [play.answer]: 0 } : Object.fromEntries(play.choices.map((c) => [c.k, 0]));
    const right = [0, 0];
    for (const [pid, a] of r.answers) {
      counts[a.k] = (counts[a.k] || 0) + 1;
      const p = game.players.get(pid);
      if (p && a.ok) right[p.team]++;
    }
    Object.assign(v, { answer: play.answer, answerHtml: play.answerHtml, tell: play.tell, revealCard: play.revealCard, counts, rightByTeam: right });
  } else if (forHost) {
    v.expected = expectedAnswerers(game).length;
    v.answeredByTeam = [0, 0];
    for (const pid of r.answers.keys()) { const p = game.players.get(pid); if (p) v.answeredByTeam[p.team]++; }
  }
  return v;
}

/**
 * Every play anyone answered, in order: how many tried it, how many got it, and the wrong pick the
 * class reached for most. Huddle: every student saw every play. Drive: each student ran the deck at
 * their own pace, so the early plays have the most attempts and the late ones only the fast few.
 */
function playByPlay(game) {
  return [...game.playStats.entries()].sort((a, b) => a[0] - b[0]).map(([n, s]) => {
    const play = playAt(game, n);
    const label = (k) => (play.choices.find((c) => c.k === k) || {}).html || k;
    const top = [...s.picks.entries()].sort((a, b) => b[1] - a[1])[0];
    return {
      n, att: s.att, right: s.right, pct: s.att ? Math.round((100 * s.right) / s.att) : 0, typed: !!play.input,
      playbookName: play.playbookName, head: play.head, summary: play.summary,
      answerHtml: play.answerHtml, tell: play.tell, card: play.revealCard,
      commonWrong: top ? { html: label(top[0]), count: top[1] } : null,
    };
  });
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
      return { id: m.id, count: m.count, typed: !!play.input, playbookName: play.playbookName, head: play.head, card: play.revealCard,
        answerHtml: play.answerHtml, tell: play.tell, commonPick: top ? { html: label(top[0]), count: top[1] } : null };
    });
}

// ---------------------------------------------------------------------------
// fact tracking (Math Facts)
// ---------------------------------------------------------------------------

const median = (xs) => {
  if (!xs.length) return null;
  const v = [...xs].sort((a, b) => a - b);
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};
const secs = (ms) => (ms == null ? null : Math.round(ms / 100) / 10);

/**
 * One student's fluency, from their answers this game. A fact is FLUENT when every try was right
 * and the typical right answer took FLUENT_MS or less; MISSED when any try was wrong; SLOW when
 * right but over the bar. "To practice" leads with the misses, then the slowest.
 */
function factSummary(player) {
  const recs = [...player.facts.values()];
  const all = recs.flatMap((r) => r.ms);
  const missed = recs.filter((r) => r.right < r.att);
  const slow = recs.filter((r) => r.right === r.att && median(r.ms) > FLUENT_MS)
    .sort((a, b) => median(b.ms) - median(a.ms));
  const fluent = recs.filter((r) => r.right === r.att && median(r.ms) <= FLUENT_MS);
  return {
    tried: recs.length,
    att: recs.reduce((t, r) => t + r.att, 0),
    right: recs.reduce((t, r) => t + r.right, 0),
    fluent: fluent.length,
    medianSec: secs(median(all)),
    missed: missed.map((r) => r.label),
    slow: slow.map((r) => ({ label: r.label, sec: secs(median(r.ms)) })),
  };
}

/**
 * The class's fact grid: one cell per fact family (a, b) — 7 × 8, 8 × 7, 56 ÷ 7 and 56 ÷ 8 all
 * land in their own (a, b) cell of the × / ÷ grid. Only families the game actually dealt appear.
 */
function factGrid(game) {
  const grids = {};
  for (const p of game.players.values()) {
    if (p.kicked) continue;
    for (const r of p.facts.values()) {
      if (!r.fam) continue;
      const g = grids[r.fam] || (grids[r.fam] = { fam: r.fam, max: r.fam === 'mul' ? 12 : 10, cells: {} });
      const key = `${r.a},${r.b}`;
      const c = g.cells[key] || (g.cells[key] = { att: 0, right: 0, ms: [] });
      c.att += r.att; c.right += r.right; c.ms.push(...r.ms);
    }
  }
  return Object.values(grids).map((g) => ({
    fam: g.fam, max: g.max,
    cells: Object.fromEntries(Object.entries(g.cells).map(([k, c]) => [k, { att: c.att, right: c.right, sec: secs(median(c.ms)) }])),
  }));
}

function factsFinal(game, players) {
  const seated = [...game.players.values()].filter((p) => !p.kicked && p.att > 0);
  return {
    fluentSec: FLUENT_MS / 1000,
    students: seated.map((p) => ({ name: p.name, team: p.team, saved: !!p.userId, ...factSummary(p) }))
      .sort((a, b) => b.fluent - a.fluent || b.right - a.right),
    grids: factGrid(game),
    // every answer, for the CSV — capped per student in trackFact
    log: seated.flatMap((p) => p.factLog.map((e) => ({ name: p.name, ...e, sec: secs(e.ms), ms: undefined }))),
    unanswered: players.filter((p) => p.att === 0).map((p) => p.name),
  };
}

function hostView(game) {
  const players = [...game.players.values()].filter((p) => !p.kicked).map((p) => ({
    id: p.id, name: p.name, team: p.team, att: p.att, comp: p.comp, yards: p.yards, best: p.best,
    avgSec: p.att ? Math.round(p.msTotal / p.att / 100) / 10 : null,
    linked: !!p.userId, away: p.conns === 0 && now() - p.lastSeen > 15000,
  }));
  const v = { ...base(game), players, feed: game.feed.slice(0, 8), round: roundView(game, true) };
  if (game.mode === 'hill') v.hill = hill.hostHill(game, now());
  if (game.phase === 'over') {
    const mvps = [0, 1].map((t) => players.filter((p) => p.team === t && p.att > 0)
      .sort((a, b) => b.yards - a.yards || b.comp - a.comp).slice(0, 3)
      .map((p) => ({ name: p.name, yards: p.yards, comp: p.comp, att: p.att })));
    const att = players.reduce((s, p) => s + p.att, 0);
    const comp = players.reduce((s, p) => s + p.comp, 0);
    // Every player, not just the top three: the scoreboard a teacher reads names off.
    const scoreboard = players.map((p) => ({ name: p.name, team: p.team, yards: p.yards, comp: p.comp, att: p.att,
      pct: p.att ? Math.round((100 * p.comp) / p.att) : null, best: p.best, avgSec: p.avgSec, saved: p.linked }))
      // a student who never answered sits at the bottom, never above someone who played and went backwards
      .sort((a, b) => (b.att > 0) - (a.att > 0) || b.yards - a.yards || b.comp - a.comp || a.name.localeCompare(b.name));
    v.final = { mvps, players: scoreboard, film: filmRoom(game), plays: playByPlay(game), att, comp, pct: att ? Math.round((100 * comp) / att) : 0 };
    if (DRILLS[game.drill] && DRILLS[game.drill].trackFacts) v.final.facts = factsFinal(game, players);
    if (game.mode === 'hill') v.final.hill = hill.finalHill(game);
  }
  return v;
}

function playerView(game, player) {
  const v = {
    ...base(game),
    me: { id: player.id, name: player.name, team: player.team, att: player.att, comp: player.comp,
      yards: player.yards, streak: player.streak, best: player.best, n: player.n },
  };
  if (game.mode === 'hill') v.hill = hill.playerHill(game, player, now());
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
      return { head: play.head, card: play.revealCard, answerHtml: play.answerHtml, tell: play.tell, typed: !!play.input,
        pickedHtml: (play.choices.find((c) => c.k === k) || {}).html || k.replace('-', '−') };
    });
    if (player.facts.size) v.facts = { fluentSec: FLUENT_MS / 1000, ...factSummary(player) };
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

// Called on every change (utils/liveDrill/store.js shadows the game to Mongo) and when a game
// leaves memory. A hook never breaks the game.
const changeHooks = [];
const dropHooks = [];
function onChange(fn) { changeHooks.push(fn); }
function onDrop(fn) { dropHooks.push(fn); }
const runHooks = (hooks, game) => { for (const fn of hooks) { try { fn(game); } catch { /* never the game's problem */ } } };

/** State changed: bump the version and push to every screen, at most ~4× a second. */
function touch(game) {
  game.version++;
  game.touchedAt = now();
  runHooks(changeHooks, game);
  if (game.pending) return;
  game.pending = true;
  const t = setTimeout(() => broadcast(game), 250);
  if (t.unref) t.unref();
}

function subscribe(game, listener) {
  game.listeners.add(listener);
  const p = listener.playerId && game.players.get(listener.playerId);
  safeWrite(listener.res, 'state', listener.kind === 'host' ? hostView(game) : playerView(game, p));
  if (p) { p.conns++; p.lastSeen = now(); touch(game); }
  return () => {
    if (!game.listeners.delete(listener)) return;
    if (p) {
      p.conns = Math.max(0, p.conns - 1);
      p.lastSeen = now();
      // The one student the round was waiting on may just have put their phone down.
      if (!maybeCloseRound(game)) touch(game);
    }
  };
}

/**
 * Open games tied to any of these classes, for the student chat banner. Games are in memory, so
 * this is a scan — but the caller asks it only after confirming some game has a class at all.
 */
function gamesForClasses(classIds) {
  const want = new Set((classIds || []).map(String));
  return [...games.values()]
    .filter((g) => g.classId && want.has(g.classId) && g.phase !== 'over')
    .map((g) => ({ code: g.code, className: g.className, hostName: g.hostName, drillTitle: g.drillTitle,
      playbookName: g.playbookName, mode: g.mode, phase: g.phase }));
}
const anyClassGames = () => [...games.values()].some((g) => g.classId && g.phase !== 'over');

// ---------------------------------------------------------------------------
// housekeeping
// ---------------------------------------------------------------------------

function dropGame(game) {
  for (const t of game.timers) clearTimeout(t);
  for (const l of game.listeners) { try { l.res.end(); } catch { /* gone */ } }
  games.delete(game.code);
  runHooks(dropHooks, game);
}

// ---------------------------------------------------------------------------
// snapshots (so a deploy or a crash can't end a game)
// ---------------------------------------------------------------------------

// What a snapshot leaves out: timers (re-armed on revive from the absolute times the game keeps),
// open streams (they belong to the process that held them), the broadcast flag, and the deck
// (a pure function of seed + focus — playAt re-deals it identically, and it is the bulk of the
// state).
const TRANSIENT = new Set(['timers', 'listeners', 'pending', 'deck']);

function fold(v) {
  if (v instanceof Map) return { __map: [...v.entries()].map(([k, x]) => [k, fold(x)]) };
  if (Array.isArray(v)) return v.map(fold);
  if (v && typeof v === 'object') {
    const o = {};
    for (const [k, x] of Object.entries(v)) if (!TRANSIENT.has(k) && x !== undefined) o[k] = fold(x);
    return o;
  }
  return v;
}
function unfold(v) {
  if (Array.isArray(v)) return v.map(unfold);
  if (v && typeof v === 'object') {
    if (Array.isArray(v.__map) && Object.keys(v).length === 1) return new Map(v.__map.map(([k, x]) => [k, unfold(x)]));
    const o = {};
    for (const [k, x] of Object.entries(v)) o[k] = unfold(x);
    return o;
  }
  return v;
}

/**
 * Hand every game off to the process replacing this one (SIGTERM): stop the clocks here — the
 * new process re-arms them from the same absolute times, and a drive ending twice would save a
 * student's facts twice — and close every stream so each phone and the board reconnect, which
 * from now on lands on the new process. Nothing is dropped: the shadow (store.js) is the game now.
 */
function freezeAll() {
  for (const g of games.values()) {
    for (const t of g.timers) clearTimeout(t);
    g.timers.clear();
    for (const l of g.listeners) { try { l.res.end(); } catch { /* gone */ } }
    g.listeners.clear();
  }
}

/** The game as plain JSON (Maps folded), enough to revive it in another process. */
function snapshot(game) { return fold(game); }

/**
 * Bring a snapshot back to life in this process: rebuild the Maps, re-deal nothing (playAt does
 * that on demand), mark every player away until their phone reconnects, and re-arm the clock
 * from the absolute times the game kept — a drive ends when it was always going to end, an open
 * Huddle round closes when its clock does. A game this process already holds is left alone.
 */
function hydrate(snap) {
  const held = games.get(snap && snap.code);
  if (held) return held;
  const game = unfold(snap);
  if (!game || !game.code || !DRILLS[game.drill]) return null;
  Object.assign(game, { deck: [], timers: new Set(), listeners: new Set(), pending: false });
  for (const p of game.players.values()) p.conns = 0;
  games.set(game.code, game);
  if (game.phase === 'live') {
    if (ownPace(game)) {
      later(game, game.endsAt - now() + DRIVE_GRACE_MS, () => endGame(game));
    } else if (game.round && !game.round.closed) {
      const round = game.round;
      later(game, round.closesAt - now() + 300, () => { if (game.round === round) closeRound(game); });
    }
  }
  return game;
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
  onGameOver, SETTINGS, FACT_SETTINGS, settingsFor, SCORING, FLUENT_MS, TEAM_K, START_POS, GameError, rulesFor,
  createGame, getGame, hostGame, playerFor, normalizeCode,
  join, kick, setTeam, start, advance, endGame, rematch, currentPlay, answer,
  hostView, playerView, subscribe, playAt, gamesForClasses, anyClassGames,
  onChange, onDrop, snapshot, hydrate, freezeAll, IDLE_TTL_MS, DONE_TTL_MS,
  _reset, _games: games,
};
