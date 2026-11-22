/**
 * Live drill — every game, played ALONE: computer rivals.
 *
 * Owner, 2026-11-21: "Possible to allow all of the games to be played individually without a
 * class?" Team Drive, Huddle, King of the Hill, Heist and Knockout Arena are all contests, so a
 * student alone needs someone to play. A solo game is therefore an ORDINARY game (games.js — the
 * same rules, clocks, grading and views a class game has, and the same phone page) with one human
 * seat and a few seats filled by the computer.
 *
 * What a rival is, and is not:
 *   - A rival is a seated player with `player.bot`. It plays ONLY through the doors a phone uses
 *     (currentPlay / answer / openSafe / pickTarget / grabChip / reportPosition), so every rule
 *     binds it exactly as it binds a student: it is timed from when its play was dealt, an alarm
 *     locks it, it can only rob or roll a boulder at someone above it, and a grab has to be where
 *     its car really is.
 *   - It is a model of a student, not an oracle: it is right with a probability (`acc`), and it
 *     takes time measured in the drill's own speed tiers (`pace` × the fast tier, never under a
 *     floor a person could not beat). Three levels; within a level the rivals differ, so there is
 *     someone to chase and someone to stay ahead of.
 *   - It is always NAMED as a computer (a 🤖 after its name). Nothing here pretends to be a
 *     classmate.
 *
 * One clock per game (`tick`, 5× a second, on the game's own timer set so endGame stops it) walks
 * every rival's small state machine. Nothing is shadowed to Mongo (store.js skips `game.solo`) and
 * a game whose student has gone (no open screen for `AWAY_MS`) is ended, so an abandoned tab
 * cannot leave rivals playing each other all night.
 *
 * Tests: tests/unit/liveDrillRivals.test.js.
 */
const crypto = require('crypto');
const G = require('./games');
const knockout = require('./knockout');
const { defOf } = require('./engine');

// How good the rivals are. `acc` = chance an answer is right; `pace` = thinking time as a multiple
// of the drill's FAST tier (3 s a fact, 6 s a course play, 20 s a test question). Calibrated with
// the simulator in the test file against a typical student (about 70% right at about the fast
// tier): they should beat Easy most of the time, split Medium, and lose most of the time to Hard.
const LEVELS = {
  easy: { name: 'Easy', acc: 0.55, pace: 1.7 },
  medium: { name: 'Medium', acc: 0.7, pace: 1.25 },
  hard: { name: 'Hard', acc: 0.88, pace: 0.9 },
};
const DEFAULT_LEVEL = 'medium';
// Within a level the rivals are not clones: [accuracy offset, pace factor], weakest first.
const SPREAD = [[-0.09, 1.18], [-0.04, 1.08], [0, 1], [0.04, 0.94], [0.08, 0.88]];
// How many rivals each game seats. The two team games are one against one (your ball against
// theirs); the three free-for-alls need a field.
const RIVALS = { drive: 1, huddle: 1, hill: 5, heist: 5, knockout: 7 };
const NAMES = ['Ada', 'Max', 'Kai', 'Zoe', 'Rex', 'Ivy', 'Leo', 'Mia'];
const TAG = ' 🤖';

const TICK_MS = 200;
const AWAY_MS = 45 * 1000; // the student's screen has been closed this long: the game is over
const REVEAL_MAX_MS = 15 * 1000; // Huddle: the student taps Next; this is only the fallback
// thinking time, as a share of (fast tier × pace): a spread, and a floor nobody answers under
const THINK = { lo: 0.55, hi: 1.5, floor: 0.4 };
const AFTER_MS = [500, 1300]; // reading the feedback before the next play
const SAFE_MS = [700, 1700]; // choosing a safe
const PICK_MS = [700, 1800]; // choosing a target
// Knockout Arena: finding the orb (reading the board), then driving to it
const ARENA = {
  read: { facts: [1600, 4600], labels: [300, 2600] }, // × pace; labels have had think time already
  reread: [900, 2400], // after a wrong orb, or one somebody else took
  drive: [0.5, 0.92], // share of a car's cruising speed (1 / pace, clamped): nobody steers perfectly
  wander: 0.25, // a safe car drifts
};

const fail = (status, message) => new G.GameError(status, message);
const span = (rnd, [lo, hi]) => lo + rnd() * (hi - lo);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** A small seeded generator per rival: a game replays the same way from the same seeds. */
function rng(seed) {
  let h = crypto.createHash('sha256').update(String(seed)).digest().readUInt32LE(0) || 1;
  return () => { h ^= h << 13; h >>>= 0; h ^= h >> 17; h ^= h << 5; h >>>= 0; return h / 4294967296; };
}

const human = (game) => game.solo && game.players.get(game.solo.humanId);
const rivalsOf = (game) => [...game.players.values()].filter((p) => p.bot && !p.kicked);
const levelOf = (level) => (Object.hasOwn(LEVELS, level) ? level : DEFAULT_LEVEL);

/** Rival i of n at a level: the level's numbers, spread so the field is not five clones. */
function profile(level, i, n) {
  const L = LEVELS[levelOf(level)];
  // one rival is the level itself; a field is spread evenly across SPREAD
  const [da, fp] = n <= 1 ? [0, 1] : SPREAD[Math.round((i * (SPREAD.length - 1)) / (n - 1))];
  return { acc: clamp(L.acc + da, 0.3, 0.97), pace: L.pace * fp };
}

function arm(game) {
  const bots = rivalsOf(game);
  bots.forEach((p, i) => {
    const pr = profile(game.solo.level, i, bots.length);
    p.bot = { ...pr, i, rnd: rng(`${game.seed}:rival:${i}`), due: 0, n: 0, answerAt: 0, safeAt: 0, pickAt: 0, round: 0, right: true };
  });
}

/**
 * Open a game to play alone: one human seat, the rivals, still in the lobby (the student's page
 * starts it with `begin` once it has loaded, so no clock runs while a page is opening).
 * `owner` is the device (or account) that asked: opening another game retires its last one.
 */
function open({ drill, playbook, mode, seconds, plays, secondsPerPlay, focus, level, name, userId, owner, hub, skill }) {
  if (!G.MODES.includes(mode)) throw fail(400, 'No such game.');
  const lv = levelOf(level);
  const game = G.createGame({
    hostId: `solo:${String(owner || crypto.randomBytes(12).toString('hex')).slice(0, 60)}`, hostName: '',
    drill, playbook, mode, seconds, plays, secondsPerPlay, focus,
    solo: { level: lv, hub: hub || null, skill: skill || null, humanId: null, saves: !!userId }, // skill: the bank skill a /drill/skills game came from
  });
  const seat = G.join(game, String(name || '').trim() || 'You', { userId });
  game.solo.humanId = seat.player.id;
  const n = RIVALS[mode];
  // the names start somewhere new each game, so "Ada" is not always the one to beat
  const at = crypto.createHash('sha256').update(game.seed).digest()[0] % NAMES.length;
  for (let i = 0; i < n; i++) {
    const { player } = G.join(game, `Rival ${i + 1}`);
    player.name = NAMES[(at + i) % NAMES.length] + TAG;
    player.bot = {}; // armed below
    player.conns = 1; // a rival is always "here": a Huddle round waits for it, and it always answers
  }
  arm(game);
  return { game, token: seat.token, player: seat.player };
}

const mine = (game, player) => {
  if (!game.solo || !player || player.id !== game.solo.humanId) throw fail(403, 'Only the player of a solo game can do that.');
};

/** Kick off (the student tapped Start). */
function begin(game, player) {
  mine(game, player);
  G.start(game);
  player.lastSeen = Date.now();
  run(game);
}

/** Play it again: same seat, same rivals (at `level`, if one is given), a fresh deal — back to the lobby. */
function again(game, player, level) {
  mine(game, player);
  G.rematch(game);
  if (level && Object.hasOwn(LEVELS, level)) game.solo.level = level;
  arm(game);
}

/** Huddle, alone: the student is the one who says "next play". */
function next(game, player) {
  mine(game, player);
  if (game.mode !== 'huddle') throw fail(409, 'Only Huddle goes play by play.');
  if (game.phase === 'reveal') G.advance(game);
}

// ---------------------------------------------------------------------------
// the clock
// ---------------------------------------------------------------------------

function run(game) {
  const t = setInterval(() => {
    if (game.phase === 'over' || game.phase === 'lobby') { clearInterval(t); game.timers.delete(t); return; }
    try { tick(game, Date.now()); } catch { /* a rival's slip never breaks the student's game */ }
  }, TICK_MS);
  if (t.unref) t.unref();
  game.timers.add(t);
}

function tick(game, at) {
  const me = human(game);
  if (!me || (me.conns <= 0 && at - me.lastSeen > AWAY_MS)) { G.endGame(game); return; }
  if (game.mode === 'huddle') return huddleTick(game, at);
  if (game.mode === 'knockout') return arenaTick(game, at);
  for (const p of rivalsOf(game)) paceTick(game, p, at);
}

// ---------------------------------------------------------------------------
// answering a play
// ---------------------------------------------------------------------------

/** How long this rival thinks about a play: its pace, in the drill's own speed tier. */
function thinkMs(game, b) {
  const fast = G.scoringFor(game).driveMs[0];
  return Math.round(Math.max(fast * THINK.floor, fast * b.pace * span(b.rnd, [THINK.lo, THINK.hi])));
}

/** What the rival sends: the answer, or (1 − acc of the time) one of the wrong ones. */
function pickKey(play, b) {
  if (b.rnd() < b.acc) return play.answer;
  if (play.input === 'number' || !(play.choices && play.choices.length)) {
    const v = Number(play.answer);
    // a typed slip: one off, or a neighbouring fact
    return Number.isFinite(v) ? String(v + (b.rnd() < 0.5 ? 1 : -1) * (1 + Math.floor(b.rnd() * 2))) : `${play.answer}0`;
  }
  const wrong = play.choices.filter((c) => c.k !== play.answer);
  return wrong.length ? wrong[Math.floor(b.rnd() * wrong.length)].k : play.answer;
}

/** Is a smoke bomb or a flip on this rival's "screen"? (Heist: a gadget hits every screen but the finder's.) */
const fogged = (game, p, at) => game.mode === 'heist' && (game.heist.effects || []).some((e) => e.until > at && e.by !== p.id);

/**
 * Team Drive, King of the Hill, Heist — and the pit of Knockout Arena: one rival, one step. It asks
 * for its play (which starts that play's clock, as it does for a student), thinks, answers, reads
 * the feedback, and handles whatever the game puts in front of the next play.
 */
function paceTick(game, p, at, b = p.bot) {
  if (at < b.due) return;
  if (fogged(game, p, at)) { if (b.answerAt) b.answerAt += TICK_MS; return; } // it cannot read its screen either
  let cur;
  try { cur = G.currentPlay(game, p); } catch { b.due = at + 500; return; }
  if (cur.alarm) { b.due = cur.alarm + 150; b.n = 0; return; }
  if (cur.safe) {
    if (!b.safeAt) { b.safeAt = at + span(b.rnd, SAFE_MS); return; }
    if (at < b.safeAt) return;
    b.safeAt = 0;
    try { G.openSafe(game, p, Math.floor(b.rnd() * cur.safe.count)); } catch { /* the clock ran out */ }
    b.due = at + span(b.rnd, AFTER_MS);
    return;
  }
  if (cur.pick) {
    if (!b.pickAt) { b.pickAt = at + span(b.rnd, PICK_MS); return; }
    if (at < b.pickAt) return;
    b.pickAt = 0;
    const opts = cur.pick.options || [];
    // mostly the one on top (the list comes richest / highest first), sometimes anyone on it
    const t = opts.length ? (b.rnd() < 0.6 ? opts[0] : opts[Math.floor(b.rnd() * opts.length)]) : null;
    try { G.pickTarget(game, p, t ? t.id : 'none'); } catch { /* they moved: the game offers again, or pays cash */ }
    b.due = at + span(b.rnd, AFTER_MS);
    return;
  }
  if (!cur.play) { b.due = at + 500; return; }
  if (b.n !== cur.n) { b.n = cur.n; b.answerAt = at + thinkMs(game, b); return; }
  if (at < b.answerAt) return;
  const play = G.playAt(game, cur.n);
  try { G.answer(game, p, cur.n, pickKey(play, b)); } catch { /* the clock ran out under it */ }
  b.n = 0;
  b.due = at + span(b.rnd, AFTER_MS);
  // Heist: a rival that is holding a gadget fires it now and then (it hits the student's screen, as a classmate's would)
  if (game.mode === 'heist' && p.gadgets && p.gadgets.length && b.rnd() < 0.25) {
    try { G.useGadget(game, p, p.gadgets[0].id); } catch { /* too late */ }
  }
}

// ---------------------------------------------------------------------------
// Huddle
// ---------------------------------------------------------------------------

function huddleTick(game, at) {
  const r = game.round;
  if (!r) return;
  if (game.phase === 'reveal') {
    // the student taps Next (rivals.next); if they have walked off mid-reveal, the game still moves
    if (game.solo.revealN !== r.n) { game.solo.revealN = r.n; game.solo.revealAt = at; }
    else if (at - game.solo.revealAt > REVEAL_MAX_MS) G.advance(game);
    return;
  }
  if (game.phase !== 'live' || r.closed) return;
  for (const p of rivalsOf(game)) {
    huddleSeat(game, p, r, at);
    if (game.round !== r || r.closed) return;
  }
}

/** One seat's answer to the play on the table. */
function huddleSeat(game, p, r, at, b = p.bot) {
  if (b.round !== r.n) {
    b.round = r.n;
    // never past the play's own clock: a rival always gets an answer in
    b.answerAt = r.openedAt + Math.min(thinkMs(game, b), game.secondsPerPlay * 1000 - 600);
  }
  if (r.answers.has(p.id) || at < b.answerAt) return;
  try { G.answer(game, p, r.n, pickKey(G.playAt(game, r.n), b)); } catch { /* closed under it */ }
}

// ---------------------------------------------------------------------------
// Knockout Arena
// ---------------------------------------------------------------------------

/** Is this orb the right one for this car? (Facts: it makes the target. Labels: it answers the car's own question.) */
const rightFor = (game, p, r, chip) => (r.kind === 'labels' ? chip.text === knockout.questionFor(game, p, r.n).label : !!chip.ok);

/**
 * A rival car. The server never simulates a student's car — but a rival has no device, so this is
 * its device: it "reads the board" for a while, heads for an orb at less than a car's cruising
 * speed, and claims it through the same grab a phone sends, from where it really is. Its position
 * goes out on the ordinary `cars` frames, so it is drawn (and bumped) like any other car.
 */
function arenaTick(game, at) {
  const r = game.ko && game.ko.round;
  for (const p of rivalsOf(game)) {
    if (!p.ko.in) { paceTick(game, p, at); continue; } // the pit: answer its way back, like anyone
    carTick(game, p, r, at);
    if (r && (game.ko.round !== r || r.closed)) return;
  }
}

/** One car, one step: read the board, pick an orb, drive at it, claim it. */
function carTick(game, p, r, at, b = p.bot) {
  if (!r || r.closed || p.ko.x == null) return stop(game, p, at);
  if (b.round !== r.n) {
    b.round = r.n; b.chip = null;
    b.lookAt = (r.goAt || r.openedAt) + span(b.rnd, ARENA.read[r.kind === 'labels' ? 'labels' : 'facts']) * b.pace;
  }
  if (at < (r.goAt || 0)) return stop(game, p, at);
  if (p.ko.held.length) return drift(game, p, r, at);
  if (at < b.lookAt || p.ko.slowUntil > at) return stop(game, p, at);
  let chip = b.chip && r.chips.find((c) => c.id === b.chip);
  if (!chip || chip.by || p.ko.ate.includes(chip.id)) {
    const open = r.chips.filter((c) => !c.by && !p.ko.ate.includes(c.id));
    const here = (c) => { const q = knockout.chipAt(c, r.world, at); return Math.hypot(q.x - p.ko.x, q.y - p.ko.y); };
    const good = open.filter((c) => rightFor(game, p, r, c)).sort((x, y) => here(x) - here(y));
    const bad = open.filter((c) => !rightFor(game, p, r, c)).sort((x, y) => here(x) - here(y));
    // it reads the board right `acc` of the time; otherwise it is sure of a near miss
    chip = (b.rnd() < b.acc ? good[0] : bad[0]) || good[0] || null;
    b.chip = chip ? chip.id : null;
    if (!chip) return stop(game, p, at);
  }
  const to = knockout.chipAt(chip, r.world, at);
  const dx = to.x - p.ko.x; const dy = to.y - p.ko.y; const d = Math.hypot(dx, dy) || 1;
  const v = knockout.TUNE.speed * clamp(1 / b.pace, ARENA.drive[0], ARENA.drive[1]);
  const step = (v * TICK_MS) / 1000;
  if (d <= Math.max(step, 18)) {
    let res = null;
    try { res = G.grabChip(game, p, { round: r.n, chip: chip.id, x: to.x, y: to.y }); } catch { /* the round closed, or it moved */ }
    b.chip = null;
    if (!res || !res.ok) b.lookAt = at + span(b.rnd, ARENA.reread) * b.pace; // look again
    return undefined;
  }
  return G.reportPosition(game, p, p.ko.x + (dx / d) * step, p.ko.y + (dy / d) * step, { vx: (dx / d) * v, vy: (dy / d) * v });
}

function stop(game, p, at) {
  if (p.ko.x == null || (!p.ko.vx && !p.ko.vy)) return;
  G.reportPosition(game, p, p.ko.x, p.ko.y, { vx: 0, vy: 0 });
  void at;
}

/** A safe car idles toward the middle, out of the way of the cars still hunting. */
function drift(game, p, r, at) {
  const dx = r.world.w / 2 - p.ko.x; const dy = r.world.h / 2 - p.ko.y; const d = Math.hypot(dx, dy);
  if (d < 60) return stop(game, p, at);
  const v = knockout.TUNE.speed * ARENA.wander;
  const step = (v * TICK_MS) / 1000;
  G.reportPosition(game, p, p.ko.x + (dx / d) * step, p.ko.y + (dy / d) * step, { vx: (dx / d) * v, vy: (dy / d) * v });
}

// ---------------------------------------------------------------------------
// what a finished game was (for the student's own record — routes/liveDrill.js files it)
// ---------------------------------------------------------------------------

/** The student's own numbers from a finished solo game, or null if there is nothing to file. */
function result(game) {
  const p = human(game);
  if (!game.solo || !p || !p.userId || !game.startedAt || !p.att) return null;
  const score = game.mode === 'hill' ? Math.round(p.h || 0)
    : game.mode === 'heist' ? Math.round(p.cash || 0)
      : game.mode === 'knockout' ? Math.round((p.ko && p.ko.pts) || 0)
        : Math.max(0, Math.round(p.yards || 0));
  return {
    userId: p.userId, hub: game.solo.hub, drill: game.drill, playbook: game.playbook, mode: game.mode,
    seconds: clamp(Math.round(((game.endedAt || Date.now()) - game.startedAt) / 1000), 0, 3600),
    focus: game.focus || [], score: clamp(score, 0, 100000), right: p.comp, attempted: p.att, streak: p.best,
    graded: true, playedAt: new Date(),
  };
}

/** Which games a drill can be played as, alone (Knockout Arena only plays some drills). */
function modesFor(drill, playbook) {
  if (!defOf(drill)) return [];
  return G.MODES.filter((m) => m !== 'knockout' || knockout.playable(drill, playbook));
}

module.exports = {
  LEVELS, DEFAULT_LEVEL, RIVALS, NAMES, TAG, TICK_MS, AWAY_MS, REVEAL_MAX_MS, THINK, ARENA,
  open, begin, again, next, result, modesFor, profile, levelOf, rivalsOf, human, thinkMs, pickKey, tick, rng,
  // a seat driven by a profile — the rivals themselves, and the simulated student in the tests
  paceTick, huddleSeat, carTick, _arm: arm,
};
