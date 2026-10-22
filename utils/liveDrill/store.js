/**
 * Live Drill store — the running games' shadow in Mongo, so a deploy can't end a game.
 *
 * games.js keeps every game in memory, which is right for a whole class answering several times
 * a second — but a Render deploy swaps the process, and on 2026-10-22 two class games died
 * mid-play that way: every phone and the teacher's board reconnected to a server that had never
 * heard of their code. So:
 *
 *   - every change to a game (games.onChange) schedules a write of its snapshot, coalesced to
 *     one per game per second — answers arrive far faster than that, and a second of play is the
 *     most a crash can lose;
 *   - a request for a code this process doesn't hold asks Mongo (load) and revives the game —
 *     lazily, on the first request, never at boot: on a deploy the old process keeps playing and
 *     saving through its drain window, and the phones only reach the new one after that, so the
 *     snapshot they revive is the newest;
 *   - shutdown flushes whatever is scheduled (server.js, before the DB connection closes).
 *
 * Without a DB connection (unit tests, a bare harness) every write is skipped and every load
 * misses: the game module behaves exactly as before.
 */
const mongoose = require('mongoose');
const G = require('./games');
const LiveDrillGame = require('../../models/liveDrillGame');
const logger = require('../logger').child({ module: 'liveDrillStore' });

const SAVE_DELAY_MS = 1000;
const MISS_TTL_MS = 10 * 1000; // a code that wasn't in the DB stays "not found" this long without re-asking

const connected = () => mongoose.connection && mongoose.connection.readyState === 1;

const scheduled = new Map(); // code → timer
const inflight = new Map(); // code → promise of the write in progress
const misses = new Map(); // code → when it was last found missing
let paused = false; // tests, and a harness with no DB: never touch Mongo

async function write(game) {
  if (!connected()) return;
  const snap = G.snapshot(game);
  try {
    await LiveDrillGame.updateOne(
      { code: game.code },
      { $set: { hostId: game.hostId, classId: game.classId || null, phase: game.phase, version: game.version, touchedAt: new Date(game.touchedAt), state: snap } },
      { upsert: true },
    );
  } catch (err) {
    logger.error('live drill snapshot failed', { code: game.code, error: err.message });
  }
}

/** Write this game's snapshot now (after any write already in progress). */
function saveNow(game) {
  const t = scheduled.get(game.code);
  if (t) { clearTimeout(t); scheduled.delete(game.code); }
  const prev = inflight.get(game.code) || Promise.resolve();
  const p = prev.then(() => write(game)).finally(() => { if (inflight.get(game.code) === p) inflight.delete(game.code); });
  inflight.set(game.code, p);
  return p;
}

/** games.onChange: coalesce a burst of changes into one write a second. */
function schedule(game) {
  if (paused || !connected() || scheduled.has(game.code)) return;
  const t = setTimeout(() => { scheduled.delete(game.code); saveNow(game); }, SAVE_DELAY_MS);
  if (t.unref) t.unref();
  scheduled.set(game.code, t);
}

/** games.onDrop: a game swept from memory (finished an hour ago, or idle) leaves the shadow too. */
function forget(game) {
  const t = scheduled.get(game.code);
  if (t) { clearTimeout(t); scheduled.delete(game.code); }
  if (paused || !connected()) return;
  LiveDrillGame.deleteOne({ code: game.code }).catch((err) => logger.warn('live drill shadow not dropped', { code: game.code, error: err.message }));
}

/** Only snapshots the game module itself would still hold are worth reviving. */
function stale(doc) {
  const age = Date.now() - new Date(doc.touchedAt).getTime();
  if (age > G.IDLE_TTL_MS) return true;
  const endedAt = doc.state && doc.state.endedAt;
  return doc.phase === 'over' && endedAt && Date.now() - endedAt > G.DONE_TTL_MS;
}

/**
 * The game for this code: from memory, else revived from its snapshot. Null when there is none.
 * Call it before any games.getGame / hostGame lookup in a request.
 */
async function load(code) {
  const c = G.normalizeCode(code);
  if (!c) return null;
  const held = G.getGame(c);
  if (held) return held;
  if (paused || !connected()) return null;
  const missedAt = misses.get(c);
  if (missedAt && Date.now() - missedAt < MISS_TTL_MS) return null;
  let doc;
  try { doc = await LiveDrillGame.findOne({ code: c }).lean(); } catch (err) {
    logger.error('live drill snapshot read failed', { code: c, error: err.message });
    return null;
  }
  if (!doc || stale(doc)) { misses.set(c, Date.now()); return null; }
  const game = G.hydrate(doc.state);
  if (game) logger.info('live drill revived from snapshot', { code: c, phase: game.phase, players: game.players.size });
  return game;
}

// The chat banner polls every signed-in student every 20 s; the usual answer is "no class game
// anywhere", and that is one cheap count every few seconds for the whole server, not a query per
// student.
const CLASS_PEEK_MS = 5000;
let classPeek = { at: 0, any: false };

/** Is any open class game in the shadow at all? (Cached a few seconds; false without a DB.) */
async function anyClassGames() {
  if (paused || !connected()) return false;
  if (Date.now() - classPeek.at < CLASS_PEEK_MS) return classPeek.any;
  let any = false;
  try { any = (await LiveDrillGame.countDocuments({ classId: { $ne: null }, phase: { $ne: 'over' } })) > 0; } catch (err) {
    logger.error('live drill class peek failed', { error: err.message });
  }
  classPeek = { at: Date.now(), any };
  return any;
}

/** Revive every open game tied to these classes (the student chat banner on a fresh process). */
async function loadForClasses(classIds) {
  if (paused || !connected() || !classIds || !classIds.length) return;
  let docs;
  try {
    docs = await LiveDrillGame.find({ classId: { $in: classIds.map(String) }, phase: { $ne: 'over' } }).lean();
  } catch (err) {
    logger.error('live drill class snapshots read failed', { error: err.message });
    return;
  }
  for (const doc of docs) if (!stale(doc)) G.hydrate(doc.state);
}

/** Write every scheduled snapshot now and wait for it (shutdown). */
async function flush() {
  const codes = [...scheduled.keys()];
  const waits = codes.map((code) => { const g = G.getGame(code); return g ? saveNow(g) : Promise.resolve(); });
  await Promise.all([...waits, ...inflight.values()]);
}

let handingOff = false;
/** True once this process has handed its games off: game requests here get a 503 to retry. */
const isHandingOff = () => handingOff;

/**
 * SIGTERM: this process is being replaced. Write every game as it stands, stop its clocks and
 * close its streams (games.freezeAll), and from now on answer every game request 503 — Render's
 * proxy may route to this process for a few more seconds, and a phone served here would play a
 * game the new process can no longer see. The clients retry a 503 for a few seconds, which is
 * long enough to land on the new process (routes/liveDrill.js, play.js / host.js `api`).
 */
async function handoff() {
  if (handingOff) return;
  handingOff = true;
  const games = [...G._games.values()];
  if (connected()) await Promise.all(games.map((g) => saveNow(g)));
  G.freezeAll();
  if (games.length) logger.info('live drill games handed off', { games: games.length });
}

G.onChange(schedule);
G.onDrop(forget);

function _pause(v = true) { paused = v; handingOff = false; misses.clear(); classPeek = { at: 0, any: false }; for (const t of scheduled.values()) clearTimeout(t); scheduled.clear(); }

module.exports = { load, loadForClasses, anyClassGames, flush, handoff, isHandingOff, saveNow, SAVE_DELAY_MS, MISS_TTL_MS, _pause, _write: write };
