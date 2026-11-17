/**
 * Live drill — Knockout Arena (the fifth game type): last car running.
 *
 * Musical chairs in a neon arena. Every round the server posts a TARGET number and scatters chips,
 * each one a fact ("7×8", "60−4"). There is always ONE FEWER correct chip than cars. A car that
 * ends the round holding no correct chip is OUT. A car may hold as many as it can grab — every
 * extra chip leaves another car without one — but a WRONG chip slows it and spills every chip it
 * holds back onto the floor, so greed has a price and so does guessing.
 *
 * Out is not over. A benched student answers plays from the game's own deck (the ordinary
 * own-pace answer path in games.js, so Math Facts answers are tracked and saved like any other
 * game); `comeback` right in a row — or `comebackTotal` right in all, so a student who keeps
 * missing one fact is never locked out — puts them back in the arena at the next round. When the
 * gate closes (the teacher's clock), comebacks stop and it is sudden death to one car.
 *
 * The bench is its own race too (owner, 2026-11-17: "the facts fluency when out should count for
 * something"): every right bench answer scores, a FLUENT one double, and the top bench scorer is
 * the game's Fact Champion — a second winner, crowned beside the last car. After the gate closes
 * it is the only thing a benched student is playing for, and it is all math.
 *
 * WHO DECIDES WHAT. Each student steers their own car on their own device; the server never
 * simulates movement. What the server owns is everything that scores: which chips exist, which are
 * correct (never sent while a round is open), who grabbed each one first, who is out, who is back.
 * A chip drifts on a path that is a pure function of time (`chipAt`), so every screen and the
 * server agree on where it is with nothing to sync. A grab is a claim — "I am at (x, y) touching
 * chip c" — that the server checks against the chip's position at its own clock and against how
 * far that car could have driven since its last report. Other cars are cosmetic: positions are
 * reported about twice a second and fanned out a beat behind (games.js `cars` events).
 *
 * State lives on the game (`game.ko`) and on each player (`p.ko`); both are plain data, so the
 * Mongo shadow (store.js) carries a game across a deploy and `rearm` restarts its clocks.
 */
const crypto = require('crypto');

/** The playbooks of the Math Facts bank this game can build chips for. */
const BOOKS = ['all', 'add', 'sub', 'mul', 'div'];

const TUNE = {
  comeback: 3, // right in a row on the bench to drive again…
  comebackTotal: 6, // …or this many right since being benched, misses and all (progress that never resets)
  benchPoints: [2, 1], // a bench answer scores for the Fact Champion race: fluent (fast), or just right
  fluentMs: 3000,
  revealMs: 3000, // chips show what they were before the next round
  slowMs: 2000, // a wrong chip slows the car this long
  capMs: 150000, // sudden death cannot outlast this after the gate closes
  emptyRounds: 3, // rounds in a row where nobody grabbed anything: the class has walked away
  speed: 130, // a car's cruising speed, world units per second (the client moves it)
  dartMult: 2.5,
  chipR: 25,
  eatDist: 21, // small on purpose: brushing a chip is not eating it
  grabSlack: 70, // latency allowance on a grab's distance to the chip
  moveSlack: 160, // and on how far a car may have moved since its last report
  chipSpeed: [18, 36],
  margin: 34,
  world: { w: 1200, h: 760, per: 16 }, // the arena for 16 cars; it scales with the class
};

const X = '×';
const D = '÷';
const M = '−';

// ---------------------------------------------------------------------------
// seeded randomness: round n of a game is a pure function of (seed, n)
// ---------------------------------------------------------------------------

function rng(seed, n) {
  let a = crypto.createHash('sha256').update(`${seed}:knockout:${n}`).digest().readUInt32LE(0);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const int = (rand, lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
const pick = (rand, xs) => xs[Math.floor(rand() * xs.length)];
function shuffle(rand, xs) {
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// ---------------------------------------------------------------------------
// chips: every way the bank's facts make a number
// ---------------------------------------------------------------------------

/** Every fact of one operation whose value is v, as chip text. Facts stay inside the bank's ranges. */
const FORMS = {
  mul(v) {
    const out = [];
    for (let x = 2; x <= 12; x++) { const y = v / x; if (Number.isInteger(y) && y >= 2 && y <= 12) out.push(`${x}${X}${y}`); }
    return out;
  },
  div(v) {
    const out = [];
    if (v < 1 || v > 12) return out;
    for (let d = 2; d <= 12; d++) out.push(`${v * d}${D}${d}`);
    return out;
  },
  add(v) {
    const out = [];
    for (let x = 1; x <= 10; x++) { const y = v - x; if (y >= 1 && y <= 10) out.push(`${x}+${y}`); }
    return out;
  },
  sub(v) {
    const out = [];
    for (let y = 1; y <= 12; y++) if (v >= 0 && v + y <= 20) out.push(`${v + y}${M}${y}`);
    return out;
  },
};
const OPS = { all: ['mul', 'add', 'sub', 'div'], add: ['add'], sub: ['sub'], mul: ['mul'], div: ['div'] };

/** A target for this book. With a focus ("× 2s, 5s & 10s") one of those numbers is in the fact. */
function targetFor(book, focus, rand) {
  const f = focus && focus.length ? focus : null;
  const one = () => {
    if (book === 'mul') return (f ? pick(rand, f) : int(rand, 2, 12)) * int(rand, 2, 12);
    if (book === 'div') return int(rand, 2, 12);
    if (book === 'add') return f ? pick(rand, f) + int(rand, 1, 10) : int(rand, 6, 20);
    if (book === 'sub') return int(rand, 1, 12);
    return pick(rand, [6, 8, 9, 10, 12, 14, 15, 16, 18, 20]); // mixed: numbers several operations make
  };
  // Of a few candidates, take the one the bank can write the most ways: more distinct chips.
  let best = null;
  for (let i = 0; i < 4; i++) {
    const t = one();
    const ways = OPS[book].reduce((s, op) => s + FORMS[op](t).length, 0);
    if (ways && (!best || ways > best.ways)) best = { t, ways };
  }
  return best ? best.t : 12;
}

/**
 * The chips of one round: `nC` correct (distinct facts first; repeated only when the bank has no
 * more ways to write the number) and `nW` wrong ones that are NEAR misses — facts worth a
 * neighbouring number, which is what a student who half-knows the fact reaches for.
 */
function makeChips(book, focus, rand, nC, nW) {
  const ops = OPS[book] || OPS.all;
  const target = targetFor(book, focus, rand);
  const f = focus && focus.length ? focus.map(String) : null;
  // a focused game leads with the facts that use the focus numbers
  const lead = (xs) => (f ? [...xs.filter((t) => t.split(/[^0-9]/).some((p) => f.includes(p))), ...xs.filter((t) => !t.split(/[^0-9]/).some((p) => f.includes(p)))] : xs);
  const ways = lead(shuffle(rand, ops.flatMap((op) => FORMS[op](target))));
  const correct = [];
  for (let i = 0; correct.length < nC; i++) correct.push({ text: ways[i % ways.length], val: target });

  const used = new Set(ways);
  const wrong = [];
  const near = [1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6, 7, -7, 8, -8, 9, -9, 10, -10, 11, -11, 12, -12];
  for (const d of near) {
    if (wrong.length >= nW) break;
    const v = target + d;
    if (v < 0) continue;
    for (const text of shuffle(rand, ops.flatMap((op) => FORMS[op](v))).slice(0, 2)) {
      if (wrong.length >= nW || used.has(text)) continue;
      used.add(text);
      wrong.push({ text, val: v });
    }
  }
  return { target, correct, wrong };
}

/** The value of a chip's text — the tests re-solve every chip with this, never trusting `val`. */
function valueOf(text) {
  const m = /^(\d+)([+×÷−])(\d+)$/.exec(text);
  if (!m) return NaN;
  const a = Number(m[1]);
  const b = Number(m[3]);
  return m[2] === '+' ? a + b : m[2] === M ? a - b : m[2] === X ? a * b : a / b;
}

// ---------------------------------------------------------------------------
// the arena
// ---------------------------------------------------------------------------

/** Room for `n` cars: the 16-car arena scaled by area, so a big class is not a crush. */
function worldFor(n) {
  const s = Math.max(0.7, Math.min(2.4, Math.sqrt(Math.max(1, n) / TUNE.world.per)));
  return { w: Math.round(TUNE.world.w * s), h: Math.round(TUNE.world.h * s) };
}

/** A value bouncing between lo and hi (a triangle wave). */
function bounce(v, lo, hi) {
  const r = hi - lo;
  if (r <= 0) return lo;
  const u = (((v - lo) % (2 * r)) + 2 * r) % (2 * r);
  return lo + (u <= r ? u : 2 * r - u);
}

/** Where a chip is at time `at`. The page computes the same thing (public/js/live-drill/knockout.js). */
function chipAt(chip, world, at) {
  const t = (at - chip.t0) / 1000;
  return {
    x: bounce(chip.x + chip.vx * t, TUNE.margin, world.w - TUNE.margin),
    y: bounce(chip.y + chip.vy * t, TUNE.margin, world.h - TUNE.margin),
  };
}

function drift(rand) {
  const a = rand() * Math.PI * 2;
  const sp = TUNE.chipSpeed[0] + rand() * (TUNE.chipSpeed[1] - TUNE.chipSpeed[0]);
  return { vx: Math.round(Math.cos(a) * sp * 10) / 10, vy: Math.round(Math.sin(a) * sp * 10) / 10 };
}

// ---------------------------------------------------------------------------
// players
// ---------------------------------------------------------------------------

const seated = (game) => [...game.players.values()].filter((p) => !p.kicked);
const drivers = (game) => seated(game).filter((p) => p.ko && p.ko.in);
const gateOpen = (game, at) => !!game.ko.gateAt && at < game.ko.gateAt;
const fail = (status, message) => Object.assign(new Error(message), { status });

function reset(game) {
  game.ko = { round: null, rounds: 0, gateAt: null, capAt: null, empty: 0, ending: false, winner: null, order: null };
  for (const p of game.players.values()) resetPlayer(p, game);
}

/** A student who joins after kickoff starts on the bench: they answer their way into the arena. */
function resetPlayer(p, game) {
  p.ko = {
    in: !game || game.phase === 'lobby', held: [], ate: [], slowUntil: 0,
    row: 0, since: 0, ready: false, outAt: 0, outRound: 0, benchPts: 0,
    grabbed: 0, wrong: 0, comebacks: 0, benchRight: 0, knocked: 0,
    x: null, y: null, posAt: 0, spawn: 0,
  };
}

function spawn(game, p, world, rand, at) {
  Object.assign(p.ko, { x: Math.round(60 + rand() * (world.w - 120)), y: Math.round(60 + rand() * (world.h - 120)), posAt: at, spawn: game.ko.rounds });
}

// ---------------------------------------------------------------------------
// rounds
// ---------------------------------------------------------------------------

function start(game, io) {
  const at = io.now();
  game.ko.gateAt = at + game.seconds * 1000;
  game.ko.capAt = game.ko.gateAt + TUNE.capMs;
  game.endsAt = game.ko.gateAt; // the clock every screen shows is the gate
  openRound(game, io);
}

function openRound(game, io) {
  const mn = game.ko;
  const at = io.now();
  const n = ++mn.rounds;
  const rand = rng(game.seed, n);
  const pool = drivers(game);
  const world = worldFor(pool.length);
  const nC = Math.max(1, pool.length - 1);
  const nW = Math.max(3, Math.min(12, Math.round(pool.length / 3)));
  const made = makeChips(BOOKS.includes(game.playbook) ? game.playbook : 'all', game.focus, rand, nC, nW);
  const chips = [];
  const all = shuffle(rand, [...made.correct.map((c) => ({ ...c, ok: true })), ...made.wrong.map((c) => ({ ...c, ok: false }))]);
  for (const c of all) {
    let x = 0; let y = 0;
    for (let tries = 0; tries < 30; tries++) {
      x = TUNE.margin + rand() * (world.w - 2 * TUNE.margin);
      y = TUNE.margin + rand() * (world.h - 2 * TUNE.margin);
      if (chips.every((o) => Math.hypot(o.x - x, o.y - y) > 70)) break;
    }
    chips.push({ id: `c${n}-${chips.length}`, text: c.text, val: c.val, ok: c.ok, x: Math.round(x), y: Math.round(y), ...drift(rand), t0: at, by: null, hits: 0 });
  }
  for (const p of pool) {
    Object.assign(p.ko, { held: [], ate: [], slowUntil: 0 });
    if (p.ko.x == null) spawn(game, p, world, rand, at);
    else { p.ko.x = Math.min(world.w - 14, Math.max(14, p.ko.x)); p.ko.y = Math.min(world.h - 14, Math.max(14, p.ko.y)); p.ko.posAt = at; }
  }
  const round = { n, target: made.target, world, openedAt: at, closesAt: at + game.secondsPerPlay * 1000, closed: false, revealUntil: null, chips, out: [], nobodyOut: false, cars: pool.length };
  mn.round = round;
  io.later(round.closesAt - at + 200, () => { if (game.ko.round === round && !round.closed) closeRound(game, io); });
  io.touch();
}

/**
 * A car claims a chip. First claim the server sees wins. A wrong chip is not consumed (several
 * cars can hit it, which is what the reveal counts) but one car is only stung by it once.
 */
function grab(game, player, body, io) {
  const mn = game.ko;
  const r = mn.round;
  const m = player.ko;
  const at = io.now();
  if (game.phase !== 'live' || !r || r.closed || Number(body && body.round) !== r.n) throw fail(409, 'That round is over.');
  if (!m.in) throw fail(409, 'You are not in the arena.');
  const chip = r.chips.find((c) => c.id === String(body.chip));
  if (!chip) throw fail(400, 'No such chip.');
  const x = Number(body.x);
  const y = Number(body.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw fail(400, 'Where are you?');
  // The car must be where it says it is: near the chip (at the server's clock), and reachable
  // from where it last reported at a car's top speed. Both carry a latency allowance.
  const cp = chipAt(chip, r.world, at);
  if (Math.hypot(cp.x - x, cp.y - y) > TUNE.eatDist + TUNE.grabSlack) throw fail(409, 'Too far from that chip.');
  if (m.x != null && m.posAt) {
    const reach = (TUNE.speed * TUNE.dartMult * (at - m.posAt)) / 1000 + TUNE.moveSlack;
    if (Math.hypot(m.x - x, m.y - y) > reach) throw fail(409, 'Too far from that chip.');
  }
  Object.assign(m, { x, y, posAt: at });
  if (chip.by) return { taken: true };

  if (chip.ok) {
    chip.by = player.id;
    m.held.push(chip.id);
    m.grabbed++;
    const left = r.chips.some((c) => c.ok && !c.by);
    if (!left) closeRound(game, io); else io.touch();
    return { ok: true, held: m.held.length, text: chip.text };
  }
  if (m.ate.includes(chip.id)) return { again: true };
  m.ate.push(chip.id);
  chip.hits++;
  m.wrong++;
  m.slowUntil = at + TUNE.slowMs;
  // every chip this car holds goes back on the floor, drifting away from it
  const rand = rng(game.seed, `${r.n}:${player.id}:${m.wrong}`);
  const dropped = [];
  for (const id of m.held) {
    const c = r.chips.find((k) => k.id === id);
    if (!c) continue;
    const a = rand() * Math.PI * 2;
    Object.assign(c, { by: null, t0: at, x: Math.round(bounce(x + Math.cos(a) * 40, TUNE.margin, r.world.w - TUNE.margin)), y: Math.round(bounce(y + Math.sin(a) * 40, TUNE.margin, r.world.h - TUNE.margin)), ...drift(rand) });
    dropped.push(id);
  }
  m.held = [];
  io.touch();
  return { ok: false, text: chip.text, val: chip.val, target: r.target, dropped: dropped.length, slowUntil: m.slowUntil };
}

/** The music stops. A driver with no chip is out — unless nobody has one, and then nobody is. */
function closeRound(game, io) {
  const mn = game.ko;
  const r = mn.round;
  if (!r || r.closed) return;
  const at = io.now();
  r.closed = true;
  r.revealUntil = at + TUNE.revealMs;
  const pool = drivers(game);
  const losers = pool.filter((p) => !p.ko.held.length);
  if (losers.length === pool.length) {
    r.nobodyOut = true;
    mn.empty++;
  } else {
    mn.empty = 0;
    for (const p of pool) if (p.ko.held.length > 1) p.ko.knocked += p.ko.held.length - 1;
    for (const p of losers) {
      Object.assign(p.ko, { in: false, row: 0, since: 0, ready: false, outAt: at, outRound: r.n, x: null, y: null });
      p.issuedAt = null; // the bench deals from where this student's own deck stands
      r.out.push(p.name);
    }
    if (losers.length) io.feed({ type: 'out', names: r.out.slice(0, 6), count: losers.length, round: r.n });
  }
  const left = drivers(game).length;
  const waiting = seated(game).some((p) => !p.ko.in && p.ko.ready);
  mn.ending = (left <= 1 && !waiting) || at >= mn.capAt || mn.empty >= TUNE.emptyRounds;
  io.later(TUNE.revealMs, () => { if (game.ko.round === r) next(game, io); });
  io.touch();
}

function next(game, io) {
  const mn = game.ko;
  if (game.phase !== 'live') return;
  if (mn.ending) { io.end(); return; }
  const back = seated(game).filter((p) => !p.ko.in && p.ko.ready);
  for (const p of back) Object.assign(p.ko, { in: true, ready: false, row: 0, comebacks: p.ko.comebacks + 1, x: null, y: null });
  if (back.length) io.feed({ type: 'back', names: back.map((p) => p.name).slice(0, 6), count: back.length });
  openRound(game, io);
}

/** After a deploy: restart whichever clock the round was on. */
function rearm(game, io) {
  const r = game.ko && game.ko.round;
  if (!r || game.phase !== 'live') return;
  const at = io.now();
  if (!r.closed) io.later(r.closesAt - at + 200, () => { if (game.ko.round === r && !r.closed) closeRound(game, io); });
  else io.later((r.revealUntil || at) - at, () => { if (game.ko.round === r) next(game, io); });
}

/** Still driving first (most chips grabbed breaks a tie); then whoever lasted longest. */
function standings(game) {
  return seated(game).sort((a, b) => (b.ko.in - a.ko.in)
    || (a.ko.in ? b.ko.grabbed - a.ko.grabbed : b.ko.outRound - a.ko.outRound || b.ko.outAt - a.ko.outAt)
    || a.name.localeCompare(b.name));
}

function finish(game) {
  const order = standings(game);
  const top = order[0];
  game.ko.order = order.map((p) => p.id);
  // one car left is the winner outright; a game the teacher ended early goes to the standings
  game.ko.winner = top && game.startedAt ? top.id : null;
  if (top && game.startedAt) game.ko.sole = drivers(game).length === 1;
}

// ---------------------------------------------------------------------------
// the bench
// ---------------------------------------------------------------------------

/** Called before a benched student's play is dealt or graded: only the pit answers plays. */
function bench(game, player) {
  if (player.ko.in) throw fail(409, 'You are in the arena — grab an orb.');
  return { ready: player.ko.ready };
}

function onBenchAnswer(game, player, res, ms, at, feed) {
  const m = player.ko;
  let pts = 0;
  if (res.ok) {
    pts = ms <= TUNE.fluentMs ? TUNE.benchPoints[0] : TUNE.benchPoints[1];
    m.row++; m.since++; m.benchRight++; m.benchPts += pts;
  } else m.row = 0;
  const open = gateOpen(game, at);
  if (open && !m.ready && (m.row >= TUNE.comeback || m.since >= TUNE.comebackTotal)) {
    m.ready = true;
    feed({ type: 'ready', who: player.name });
  }
  return { ...benchView(m), pts, fluent: pts === TUNE.benchPoints[0], gateOpen: open };
}
const benchView = (m) => ({ row: m.row, need: TUNE.comeback, since: m.since, needTotal: TUNE.comebackTotal, ready: m.ready, benchPts: m.benchPts });

/** The Fact Champion race: bench points, most first. */
function champions(game) {
  return seated(game).filter((p) => p.ko.benchPts > 0).sort((a, b) => b.ko.benchPts - a.ko.benchPts || b.ko.benchRight - a.ko.benchRight || a.name.localeCompare(b.name));
}

/** A position report (about twice a second). Cosmetic for everyone else; the anchor for grabs. */
function position(game, player, x, y, at) {
  const r = game.ko && game.ko.round;
  const m = player.ko;
  x = Number(x); y = Number(y);
  if (!r || !m.in || !Number.isFinite(x) || !Number.isFinite(y)) return;
  Object.assign(m, { x: Math.min(r.world.w, Math.max(0, Math.round(x))), y: Math.min(r.world.h, Math.max(0, Math.round(y))), posAt: at });
}

/** Everyone in the arena, for the other screens: [id, x, y, chips held]. */
function carFrame(game) {
  return drivers(game).filter((p) => p.ko.x != null).map((p) => [p.id, p.ko.x, p.ko.y, p.ko.held.length]);
}

// ---------------------------------------------------------------------------
// views
// ---------------------------------------------------------------------------

/** A chip as a screen may see it. Whether it is correct is sent only once the round has closed. */
function chipView(c, closed) {
  const v = { id: c.id, text: c.text, x: c.x, y: c.y, vx: c.vx, vy: c.vy, t0: c.t0, taken: c.by ? 1 : 0 };
  if (closed) Object.assign(v, { ok: c.ok, val: c.val, hits: c.hits });
  return v;
}

function roundView(game) {
  const r = game.ko.round;
  if (!r) return null;
  const v = { n: r.n, target: r.target, world: r.world, openedAt: r.openedAt, closesAt: r.closesAt, closed: r.closed, revealUntil: r.revealUntil, cars: r.cars,
    chips: r.chips.map((c) => chipView(c, r.closed)) };
  if (r.closed) {
    const worst = r.chips.filter((c) => !c.ok && c.hits).sort((a, b) => b.hits - a.hits)[0];
    Object.assign(v, { out: r.out, nobodyOut: r.nobodyOut, worst: worst ? { text: worst.text, val: worst.val, hits: worst.hits } : null });
  }
  return v;
}

const tune = () => ({ speed: TUNE.speed, dartMult: TUNE.dartMult, chipR: TUNE.chipR, eatDist: TUNE.eatDist, margin: TUNE.margin, slowMs: TUNE.slowMs });

function summary(game, at) {
  const all = seated(game);
  return { gateAt: game.ko.gateAt, gateOpen: gateOpen(game, at), alive: all.filter((p) => p.ko.in).length, of: all.length, ending: game.ko.ending, tune: tune() };
}

function place(game, player) {
  const order = game.ko.order || standings(game).map((p) => p.id);
  return order.indexOf(player.id) + 1;
}

function playerKnockout(game, player, at) {
  const m = player.ko;
  const v = { ...summary(game, at), round: roundView(game),
    in: m.in, ...benchView(m), held: m.held.length, mine: m.held.slice(), slowUntil: m.slowUntil,
    grabbed: m.grabbed, comebacks: m.comebacks, wrong: m.wrong,
    champ: (() => { const c = champions(game); const i = c.indexOf(player); return { rank: i < 0 ? null : i + 1, top: c[0] ? { name: c[0].name, pts: c[0].ko.benchPts, me: c[0] === player } : null }; })(),
    spawn: m.x == null ? null : { x: m.x, y: m.y, round: m.spawn } };
  if (game.phase === 'over') {
    const w = game.ko.winner && game.players.get(game.ko.winner);
    Object.assign(v, { place: place(game, player), winner: w ? { name: w.name, me: w.id === player.id } : null, sole: !!game.ko.sole });
  }
  return v;
}

function hostKnockout(game, at) {
  const all = seated(game);
  return { ...summary(game, at), round: roundView(game),
    arena: all.filter((p) => p.ko.in).map((p) => ({ id: p.id, name: p.name, held: p.ko.held.length })),
    bench: all.filter((p) => !p.ko.in).sort((a, b) => b.ko.ready - a.ko.ready || b.ko.benchPts - a.ko.benchPts)
      .map((p) => ({ id: p.id, name: p.name, row: p.ko.row, since: p.ko.since, ready: p.ko.ready, pts: p.ko.benchPts })),
    champs: champions(game).slice(0, 5).map((p) => ({ name: p.name, pts: p.ko.benchPts })) };
}

function finalKnockout(game) {
  const order = standings(game);
  const w = game.ko.winner && game.players.get(game.ko.winner);
  const best = (key) => { const p = [...order].sort((a, b) => b.ko[key] - a.ko[key])[0]; return p && p.ko[key] > 0 ? { name: p.name, n: p.ko[key] } : null; };
  return {
    winner: w ? w.name : null, sole: !!game.ko.sole, rounds: game.ko.rounds,
    standings: order.map((p, i) => ({ place: i + 1, name: p.name, alive: p.ko.in, outRound: p.ko.outRound || null,
      grabbed: p.ko.grabbed, knocked: p.ko.knocked, wrong: p.ko.wrong, comebacks: p.ko.comebacks, benchRight: p.ko.benchRight, benchPts: p.ko.benchPts, saved: !!p.userId })),
    champion: best('benchPts'),
    awards: { hog: best('grabbed'), comeback: best('comebacks') },
  };
}

/** The rules as the lobby states them — the same numbers the server plays. */
function rules(game) {
  return { comeback: TUNE.comeback, comebackTotal: TUNE.comebackTotal, benchPoints: TUNE.benchPoints.slice(), fluentSec: TUNE.fluentMs / 1000,
    gateSec: game.seconds, roundSec: game.secondsPerPlay, slowSec: TUNE.slowMs / 1000 };
}

module.exports = {
  BOOKS, TUNE, FORMS, makeChips, valueOf, worldFor, chipAt, bounce, rng,
  reset, resetPlayer, start, grab, closeRound, rearm, finish, standings, drivers,
  bench, onBenchAnswer, champions, position, carFrame,
  playerKnockout, hostKnockout, finalKnockout, rules,
};
