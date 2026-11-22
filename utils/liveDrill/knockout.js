/**
 * Live drill — Knockout Arena (the fifth game type): last car running.
 *
 * Musical chairs in a neon arena. Every round the server posts a TARGET number and scatters chips,
 * each one a fact ("7×8", "60−4"). There is always ONE FEWER correct chip than cars. A car that
 * ends the round holding no correct chip is at risk — and EXACTLY ONE car goes out each round
 * (owner, 2026-11-18, after the first class games: "everyone gets one answer. 1 player eliminated
 * each time" — holding two had been ending games in a handful of rounds). A car takes one orb and
 * is safe; the round closes the moment every orb is taken, and the car left without is out. If the
 * clock runs out with several cars empty-handed, only ONE of them goes: the one with the fewest
 * points (then the most wrong orbs this round), and the rest are spared.
 *
 * Points are the scoreboard ("more points for finding it sooner"): a right orb pays `points.max`
 * the instant the round opens, sliding to `points.min` at its close; a wrong orb slows the car and
 * costs `wrongCost`. The winner is still the last car running — the scoreboard is a second race
 * (Top scorer), the tie-break when the clock runs out, and what a game ended early is decided by.
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
 * BUMPS (owner, 2026-11-19: "the cars should collide!!! and bounce off each other"). Collisions are
 * the one thing about movement that involves two cars, and the server still does not simulate
 * them: each device bounces its OWN car off the others it sees (their reported position and
 * velocity, so the two devices make the same call from opposite sides) and reports at once. The
 * server's part is the numbers in `TUNE.bump`, sent in `tune` so every device bounces alike, and
 * the speed ceiling (`topMult`) a bounce has to stay under for the car's next grab to count.
 * A car that is SAFE (holding its orb) is a ghost: it neither hits nor is hit. Otherwise a safe
 * car, with nothing left to lose, could spend the rest of the round ramming the cars still hunting.
 *
 * POWER-UPS (owner, 2026-11-19: "make speed boost a powerup", then "every once in a while a boost
 * can appear on the board as an orb. 100 pt powerup, 50 point powerup, or speed boost"). Boost
 * used to be free every 2.5 s. Now every round deals a few POWER-UP ORBS (`dealPowerups`, one per
 * `power.per` cars, at least `power.min`): each POPS IN at its own moment in the round, drifts like a fact
 * orb, and is gone `power.life` later. A power-up is +100 points, +50 points, or a ⚡ speed charge
 * (`power.kinds`, weighted). Driving into one is a claim like an orb's (`grab` with
 * `{ power: id }`, the same plausibility check, first claim wins). Points go straight onto the
 * scoreboard (so they matter when the clock runs out on several empty-handed cars); a speed
 * charge goes in the tank, up to `boost.max` held — a full tank leaves it for someone else. A
 * charge is spent with `fire` and drives at `boost.mult` for `boost.ms`; charges carry from round
 * to round and are lost when the car goes out. Until a power-up has appeared, no screen is told it
 * exists (`roundView` hides it; a touch is scheduled for the moment it pops), so nobody can park
 * where one is about to be.
 *
 * OTHER CONTENT: LABEL ROUNDS (owner, 2026-11-20: "Can Knockout arena handle other content from my
 * courses … Little ASA and SSS SAS HL orbs and a space for a diagram", then "maybe a little built
 * in think time for each new question"). A drill marked `arena: 'labels'` in engine.js DRILLS —
 * a bank whose every play is a figure and a few short FIXED answers, like Triangle Congruence —
 * plays the arena differently from Math Facts:
 *   - EVERY CAR HAS ITS OWN QUESTION (`questionFor`: a play dealt from (seed, player, round)). One
 *     shared diagram would be one shout — "it's SAS!" — and the round is over for the whole room;
 *     with a diagram each, every student classifies their own, every round.
 *   - The orbs carry the ANSWERS ("SSS", "SAS", "Not ≅"). An orb is right for the cars whose own
 *     question it answers, so nothing about an orb is right or wrong in itself, and a car that
 *     drives into the wrong label is stung without using the orb up.
 *   - There is an orb for every car (plus one of each label nobody needs, so a missing label gives
 *     nothing away) and the round closes when ALL BUT ONE car is safe: the last one is out. Nobody
 *     is doomed by the deal; it is still one car a round.
 *   - THINK TIME: a round opens with `label.thinkMs` in which nothing can be grabbed (`goAt`). The
 *     screens show the question large and hold the cars; the points clock starts at `goAt`.
 *   - The answer to a car's question is sent to that car only once the round has closed.
 * The pit needs nothing new: a benched student answers the same bank's plays the ordinary way.
 *
 * State lives on the game (`game.ko`) and on each player (`p.ko`); both are plain data, so the
 * Mongo shadow (store.js) carries a game across a deploy and `rearm` restarts its clocks.
 */
const crypto = require('crypto');
const { defOf, dealPlay, getDrill } = require('./engine');

/** The playbooks of the Math Facts bank this game can build chips for. */
const BOOKS = ['all', 'add', 'sub', 'mul', 'div'];

const TUNE = {
  comeback: 4, // right in a row on the bench to drive again…
  comebackTotal: 8, // …or this many right since being benched, misses and all (progress that never resets)
  benchPoints: [2, 1], // a bench answer scores for the Fact Champion race: fluent (fast), or just right
  fluentMs: 3000,
  revealMs: 2200, // chips show what they were before the next round (short: a class of 30 sees ~30 of these)
  slowMs: 2000, // a wrong chip slows the car this long
  // One orb each: a car that holds its orb is safe and done for the round. (Two had let a few
  // fast students knock out half the arena per round; before that, any number.)
  maxHold: 1,
  holdSlow: 1,
  // Label rounds (a fixed-answer bank): think time before anything can be grabbed; smaller orbs (a
  // label is a few letters) in a smaller arena, which leaves the screen room for the diagram.
  label: { thinkMs: 4000, chipR: 34, eatDist: 28, world: 0.82, orbsPer: 1.25 }, // orbsPer: the arena grows once there are more orbs than this per car
  points: { max: 100, min: 40 }, // a right orb: `max` at the round's first instant, `min` at its last
  wrongCost: 10, // a wrong orb costs this many points (never below 0)
  spareRounds: 2, // sudden death may run this many rounds past one-per-car before it is called
  emptyRounds: 3, // rounds in a row where nobody grabbed anything: the class has walked away
  speed: 130, // a car's cruising speed, world units per second (the client moves it)
  // The fastest a car can honestly go — a boost, or a boost plus a bump — as a multiple of `speed`.
  // The grab check allows this much travel between reports, so a bounce must never exceed it.
  topMult: 2.5,
  // ⚡ power-ups: one canister per `per` cars each round (at least one); a charge drives at `mult`
  // for `ms`; at most `max` held. `r` is how big a canister is drawn, `eat` how close is a pickup.
  boost: { max: 2, mult: 2.2, ms: 1200 },
  // power-up orbs: one per `per` cars a round (at least `min`), popping in somewhere between `from` and
  // `to` of the way through the round and gone `life` ms later; `r` how big one is drawn, `eat` how
  // close is a grab; `kinds` the odds of each; `pts` what the point ones pay. Owner, after the first
  // class games (2026-11-19): "the power-ups need tweaking, more boosts" — one per six cars at 50%
  // speed was about one boost a round in a class of 25; now one power-up per three cars, mostly boosts.
  power: { per: 3, min: 2, from: 0.08, to: 0.8, life: 8000, r: 30, eat: 38, drift: [12, 24], kinds: { speed: 65, pts50: 25, pts100: 10 }, pts: { pts50: 50, pts100: 100 } },
  // Bumper cars (the devices do the bouncing; these are the numbers every device uses). `r` is a car's
  // radius for a hit, `kick` the least speed a bump sends a car off at, `e` how much of the closing
  // speed comes back, `stunMs` how long a bounced car coasts before its steering takes over again.
  bump: { r: 17, kick: 170, e: 0.9, stunMs: 260, ghostSafe: true },
  chipR: 40, // big enough to read a fact on a phone at arm's length and on a projector across the room
  eatDist: 32, // inside the orb's edge on purpose: brushing a chip is not eating it
  grabSlack: 70, // latency allowance on a grab's distance to the chip
  moveSlack: 160, // and on how far a car may have moved since its last report
  chipSpeed: [18, 36],
  margin: 50, // keeps a whole orb inside the wall
  carClear: 110, // an orb is dealt at least this far from every car (no round opens with a free grab)
  chipGap: 90, // and this far from every other orb (two radii and a gap: they don't open stacked)
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

/** Room for `n` cars: the 16-car arena scaled by area, so a big class is not a crush (`k` shrinks it for label rounds). */
function worldFor(n, k = 1) {
  const s = k * Math.max(0.7, Math.min(2.4, Math.sqrt(Math.max(1, n) / TUNE.world.per)));
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
  const t = Math.max(0, at - chip.t0) / 1000; // an orb holds still until its own start (label rounds: through think time)
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

// ---------------------------------------------------------------------------
// label rounds: a question per car, answers on the orbs
// ---------------------------------------------------------------------------

/** 'labels' for a fixed-answer bank (DRILLS[*].arena), else 'facts'. */
const kindOf = (game) => ((defOf(game.drill) || {}).arena === 'labels' ? 'labels' : 'facts');
/** Can the arena play this drill and playbook? Math Facts (one operation's books), or any label bank. */
const playable = (drill, book) => { const d = defOf(drill); return !!d && (d.arena === 'labels' || (!!d.trackFacts && BOOKS.includes(book))); };

const strip = (h) => String(h == null ? '' : h).replace(/<[^>]*>/g, '').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
/** What an answer is called on an orb: the bank's own short form ("Not congruent" → "Not ≅"), else the answer. */
function orbText(game, answer) {
  const bank = getDrill(game.drill).bank;
  return (bank.ORB && bank.ORB[answer]) || answer;
}

const qCache = new WeakMap(); // game → Map("seed:player:round" → question); never in the snapshot — a question is a pure function
/**
 * The question car `player` has in round `n`: a play of the game's bank dealt from (seed, player, n).
 * `label` is the orb that answers it. Never sent while the round is open (see playerKnockout).
 */
function questionFor(game, player, n) {
  let m = qCache.get(game);
  if (!m) { m = new Map(); qCache.set(game, m); }
  // the seed is in the key: "Run it back" reseeds this same game object and starts again at round 1
  const key = `${game.seed}:${player.id}:${n}`;
  let q = m.get(key);
  if (!q) {
    if (m.size > 600) m.clear();
    const play = dealPlay(game.drill, game.playbook, `${game.seed}:arena:${player.id}`, n);
    const right = strip(play.choices.find((c) => c.k === play.answer).html);
    q = { fig: (play.card.match(/<svg[\s\S]*?<\/svg>/) || [''])[0], ask: play.head, answer: right, label: orbText(game, right), tell: play.tell,
      labels: play.choices.map((c) => orbText(game, strip(c.html))) };
    m.set(key, q);
  }
  return q;
}

/**
 * The orbs of a label round: the SAME number of every label — as many as the most-needed one needs.
 * An orb for every car's answer is the floor; the counts must not differ, or the label with the most
 * orbs is the likeliest answer and a student who cannot read the figure just drives at it.
 */
function labelChips(game, pool, n, rand) {
  const need = new Map();
  let vocab = [];
  for (const p of pool) {
    const q = questionFor(game, p, n);
    vocab = q.labels;
    need.set(q.label, (need.get(q.label) || 0) + 1);
  }
  const each = Math.max(1, ...need.values());
  const out = [];
  for (const label of vocab) for (let i = 0; i < each; i++) out.push({ text: label, val: null, ok: null });
  return shuffle(rand, out);
}

function reset(game) {
  game.ko = { round: null, rounds: 0, gateAt: null, sudden: 0, empty: 0, ending: false, winner: null, order: null, labels: {}, look: null };
  for (const p of game.players.values()) resetPlayer(p, game);
}

/** A student who joins after kickoff starts on the bench: they answer their way into the arena. */
function resetPlayer(p, game) {
  p.ko = {
    in: !game || game.phase === 'lobby', held: [], ate: [], slowUntil: 0,
    row: 0, since: 0, ready: false, outAt: 0, outRound: 0, benchPts: 0,
    grabbed: 0, wrong: 0, comebacks: 0, benchRight: 0, pts: 0, roundPts: 0, firsts: 0,
    x: null, y: null, posAt: 0, spawn: 0, vx: 0, vy: 0,
    boosts: 0, boostUntil: 0, boostsUsed: 0, powers: 0, bonus: 0,
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
  game.endsAt = game.ko.gateAt; // the clock every screen shows is the gate
  openRound(game, io);
}

function openRound(game, io) {
  const mn = game.ko;
  const at = io.now();
  const n = ++mn.rounds;
  const rand = rng(game.seed, n);
  const pool = drivers(game);
  const kind = kindOf(game);
  let world = worldFor(pool.length, 1);
  let target = null; let all;
  if (kind === 'labels') {
    all = labelChips(game, pool, n, rand);
    // every label has as many orbs as the most-needed one, so there can be far more orbs than cars: room for them
    world = worldFor(Math.max(pool.length, all.length / TUNE.label.orbsPer), TUNE.label.world);
  } else {
    const nC = Math.max(1, pool.length - 1);
    const nW = Math.max(3, Math.min(12, Math.round(pool.length / 3)));
    const made = makeChips(BOOKS.includes(game.playbook) ? game.playbook : 'all', game.focus, rand, nC, nW);
    target = made.target;
    all = shuffle(rand, [...made.correct.map((c) => ({ ...c, ok: true })), ...made.wrong.map((c) => ({ ...c, ok: false }))]);
  }
  // cars first: they keep their spot from the round before, and the orbs are dealt around them
  for (const p of pool) {
    Object.assign(p.ko, { held: [], ate: [], slowUntil: 0, roundPts: 0 });
    if (p.ko.x == null) spawn(game, p, world, rand, at);
    else { p.ko.x = Math.min(world.w - 14, Math.max(14, p.ko.x)); p.ko.y = Math.min(world.h - 14, Math.max(14, p.ko.y)); p.ko.posAt = at; }
  }
  // think time (label rounds): nothing can be grabbed before `goAt`, the round's clock starts there, and the
  // orbs hold still until then (they are dealt apart; four seconds of drift would stack them before anyone moves)
  const goAt = at + (kind === 'labels' ? TUNE.label.thinkMs : 0);
  const cars = pool.map((p) => ({ x: p.ko.x, y: p.ko.y }));
  const chips = [];
  for (const c of all) {
    // No orb opens on (or a nudge from) a car, and orbs don't stack. Best of the tries if the arena is crowded.
    let best = null; let bestRoom = -Infinity;
    for (let tries = 0; tries < 40; tries++) {
      const x = TUNE.margin + rand() * (world.w - 2 * TUNE.margin);
      const y = TUNE.margin + rand() * (world.h - 2 * TUNE.margin);
      const room = Math.min(
        ...cars.map((o) => Math.hypot(o.x - x, o.y - y) / TUNE.carClear),
        ...chips.map((o) => Math.hypot(o.x - x, o.y - y) / TUNE.chipGap),
        Infinity,
      );
      if (room > bestRoom) { best = { x, y }; bestRoom = room; }
      if (room >= 1) break;
    }
    chips.push({ id: `c${n}-${chips.length}`, text: c.text, val: c.val, ok: c.ok, x: Math.round(best.x), y: Math.round(best.y), ...drift(rand), t0: goAt, by: null, hits: 0 });
  }
  const closesAt = goAt + game.secondsPerPlay * 1000;
  const powerups = dealPowerups(pool.length, world, rand, n, goAt, closesAt, chips);
  const round = { n, kind, target, world, openedAt: at, goAt, closesAt, closed: false, revealUntil: null, chips, powerups, out: [], nobodyOut: false, cars: pool.length };
  mn.round = round;
  io.later(round.closesAt - at + 200, () => { if (game.ko.round === round && !round.closed) closeRound(game, io); });
  armPowerups(game, round, io);
  io.touch();
}

/** Tell every screen the moment each power-up pops in (until then no view mentions it). */
function armPowerups(game, round, io) {
  const at = io.now();
  for (const p of round.powerups || []) if (p.at > at) io.later(p.at - at, () => { if (game.ko.round === round && !round.closed) io.touch(); });
}

/** A kind of power-up, by the odds in `power.kinds`. */
function powerKind(rand) {
  const kinds = Object.entries(TUNE.power.kinds);
  let r = rand() * kinds.reduce((t, [, w]) => t + w, 0);
  for (const [k, w] of kinds) { r -= w; if (r < 0) return k; }
  return kinds[0][0];
}

/**
 * The round's power-up orbs: one per `power.per` cars, at least one, each popping in at its own
 * moment (`at`, between `from` and `to` of the way through the round, spaced apart) and gone at
 * `until`. It pops in clear of the fact orbs — their paths are a pure function of time, so where
 * they will be at that moment is known now — and drifts from there like one (`chipAt`, `t0` = the
 * moment it appears). The cars are wherever they drove by then, so they are not considered.
 */
function dealPowerups(nCars, world, rand, n, openedAt, closesAt, chips = []) {
  const P = TUNE.power;
  const count = Math.max(P.min || 1, Math.round(nCars / P.per));
  const span = closesAt - openedAt;
  const out = [];
  for (let i = 0; i < count; i++) {
    // spread over the window: slot i of `count`, a random moment inside its slot
    const f = P.from + ((i + rand()) / count) * (P.to - P.from);
    const at = Math.round(openedAt + f * span);
    const a = rand() * Math.PI * 2; const sp = P.drift[0] + rand() * (P.drift[1] - P.drift[0]);
    const orbs = chips.map((c) => chipAt(c, world, at));
    let spot = null; let room = -Infinity;
    for (let tries = 0; tries < 30; tries++) {
      const x = TUNE.margin + rand() * (world.w - 2 * TUNE.margin); const y = TUNE.margin + rand() * (world.h - 2 * TUNE.margin);
      const r = Math.min(...orbs.map((o) => Math.hypot(o.x - x, o.y - y)), Infinity);
      if (r > room) { spot = { x, y }; room = r; }
      if (r >= TUNE.chipR + P.r + 30) break;
    }
    out.push({
      id: `p${n}-${i}`, kind: powerKind(rand),
      x: Math.round(spot.x), y: Math.round(spot.y),
      vx: Math.round(Math.cos(a) * sp * 10) / 10, vy: Math.round(Math.sin(a) * sp * 10) / 10,
      t0: at, at, until: Math.min(at + P.life, closesAt), by: null, byName: null,
    });
  }
  return out;
}
const powerShowing = (p, at) => p.at <= at && at < p.until;

/** Is the car where it says it is, and could it have got there since its last report? Throws if not. */
function plausible(m, x, y, target, near, at, what = 'chip') {
  if (Math.hypot(target.x - x, target.y - y) > near + TUNE.grabSlack) throw fail(409, `Too far from that ${what}.`);
  if (m.x != null && m.posAt) {
    const reach = (TUNE.speed * TUNE.topMult * (at - m.posAt)) / 1000 + TUNE.moveSlack;
    if (Math.hypot(m.x - x, m.y - y) > reach) throw fail(409, `Too far from that ${what}.`);
  }
}

/**
 * A car drives into a power-up orb. First claim wins. Points go straight onto the scoreboard; a
 * speed charge goes in the tank, and a full tank leaves it for someone else. A safe car may take
 * one too — it is something to race for while it waits, and charges carry to the next round.
 */
function pickPower(game, player, body, io) {
  const r = game.ko.round;
  const m = player.ko;
  const at = io.now();
  const id = String(body.power != null ? body.power : body.boost);
  const item = (r.powerups || []).find((p) => p.id === id);
  if (!item) throw fail(400, 'No such power-up.');
  if (!powerShowing(item, at)) throw fail(409, 'That power-up is gone.');
  const x = Number(body.x);
  const y = Number(body.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw fail(400, 'Where are you?');
  plausible(m, x, y, chipAt(item, r.world, at), TUNE.power.eat, at, 'power-up');
  Object.assign(m, { x, y, posAt: at });
  if (item.by) return { taken: true };
  if (item.kind === 'speed') {
    if (m.boosts >= TUNE.boost.max) return { full: true, boosts: m.boosts };
    m.boosts++;
  } else {
    const pts = TUNE.power.pts[item.kind] || 0;
    Object.assign(m, { pts: m.pts + pts, bonus: m.bonus + pts });
  }
  Object.assign(item, { by: player.id, byName: player.name });
  m.powers++;
  io.touch();
  return { power: item.kind, boosts: m.boosts, pts: TUNE.power.pts[item.kind] || 0, total: m.pts };
}

/** Spend a charge: this car drives at `boost.mult` for `boost.ms`. */
function fire(game, player, body, io) {
  const r = game.ko && game.ko.round;
  const m = player.ko;
  const at = io.now();
  if (game.phase !== 'live' || !r) throw fail(409, 'The game is not on.');
  if (!m.in) throw fail(409, 'You are not in the arena.');
  if (m.boosts < 1) throw fail(409, 'No boost left — grab a ⚡ power-up to get one.');
  m.boosts--;
  m.boostsUsed++;
  m.boostUntil = at + TUNE.boost.ms;
  position(game, player, body && body.x, body && body.y, at, body);
  io.touch();
  return { boosts: m.boosts, boostUntil: m.boostUntil };
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
  if (at < (r.goAt || 0)) throw fail(409, 'Not yet — read your question first.');
  if (body.power != null || body.boost != null) return pickPower(game, player, body, io);
  const chip = r.chips.find((c) => c.id === String(body.chip));
  if (!chip) throw fail(400, 'No such chip.');
  const x = Number(body.x);
  const y = Number(body.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw fail(400, 'Where are you?');
  // The car must be where it says it is: near the chip (at the server's clock), and reachable
  // from where it last reported at a car's top speed. Both carry a latency allowance.
  plausible(m, x, y, chipAt(chip, r.world, at), TUNE.eatDist, at);
  Object.assign(m, { x, y, posAt: at });
  // A car that has its orb is safe: nothing it touches for the rest of the round counts, right or wrong.
  if (m.held.length >= TUNE.maxHold) return { safe: true, held: m.held.length };
  if (chip.by) return { taken: true };

  // a label round: the orb is right for THIS car if it is the answer to this car's own question
  const labels = r.kind === 'labels';
  const ok = labels ? chip.text === questionFor(game, player, r.n).label : chip.ok;
  if (ok) {
    const first = !r.chips.some((c) => c.by);
    chip.by = player.id;
    m.held.push(chip.id);
    m.grabbed++;
    const pts = pointsFor(r, at);
    Object.assign(m, { pts: m.pts + pts, roundPts: pts, firsts: m.firsts + (first ? 1 : 0) });
    // facts: the music stops when the last right orb goes. Labels: when all but one car is safe.
    const left = labels
      ? drivers(game).filter((p) => p.ko.held.length).length < Math.max(1, r.cars - 1)
      : r.chips.some((c) => c.ok && !c.by);
    if (!left) closeRound(game, io); else io.touch();
    return { ok: true, held: m.held.length, text: chip.text, pts, total: m.pts, first };
  }
  if (m.ate.includes(chip.id)) return { again: true };
  m.ate.push(chip.id);
  chip.hits++;
  m.wrong++;
  m.slowUntil = at + TUNE.slowMs;
  const cost = Math.min(m.pts, TUNE.wrongCost);
  m.pts -= cost;
  io.touch();
  return { ok: false, text: chip.text, val: chip.val, target: r.target, label: labels, cost, total: m.pts, slowUntil: m.slowUntil };
}

/** What a right orb pays: sooner is more, on a straight line from `max` to `min` across the round. */
function pointsFor(r, at) {
  const from = r.goAt || r.openedAt; // (think time is not on the clock)
  const f = Math.min(1, Math.max(0, (at - from) / Math.max(1, r.closesAt - from)));
  return Math.round(TUNE.points.max - (TUNE.points.max - TUNE.points.min) * f);
}

/**
 * The music stops. ONE car goes out: the one left without an orb — or, when the clock ran out on
 * several, the empty-handed car with the fewest points. Nobody has one: nobody is out.
 */
function closeRound(game, io) {
  const mn = game.ko;
  const r = mn.round;
  if (!r || r.closed) return;
  const at = io.now();
  r.closed = true;
  r.revealUntil = at + TUNE.revealMs;
  const pool = drivers(game);
  if (r.kind === 'labels') tallyLabels(game, r, pool);
  const losers = pool.filter((p) => !p.ko.held.length);
  if (losers.length === pool.length) {
    r.nobodyOut = true;
    mn.empty++;
  } else {
    mn.empty = 0;
    // fewest points goes; then whoever hit more wrong orbs this round; then the round's own coin
    const rand = rng(game.seed, `${r.n}:out`);
    const coin = new Map(losers.map((p) => [p.id, rand()]));
    losers.sort((a, b) => a.ko.pts - b.ko.pts || b.ko.ate.length - a.ko.ate.length || coin.get(a.id) - coin.get(b.id));
    const [p, ...spared] = losers;
    Object.assign(p.ko, { in: false, row: 0, since: 0, ready: false, outAt: at, outRound: r.n, x: null, y: null, vx: 0, vy: 0, boosts: 0, boostUntil: 0 });
    p.issuedAt = null; // the bench deals from where this student's own deck stands
    r.out.push(p.name);
    r.spared = spared.map((q) => q.name);
    io.feed({ type: 'out', names: r.out.slice(), count: 1, round: r.n });
  }
  const left = drivers(game).length;
  const waiting = seated(game).some((p) => !p.ko.in && p.ko.ready);
  // Sudden death is one car a round, so it needs about one round per car — and no more than that.
  if (at >= mn.gateAt) mn.sudden = (mn.sudden || 0) + 1;
  const capped = (mn.sudden || 0) > seated(game).length + TUNE.spareRounds;
  mn.ending = (left <= 1 && !waiting) || capped || mn.empty >= TUNE.emptyRounds;
  io.later(TUNE.revealMs, () => { if (game.ko.round === r) next(game, io); });
  io.touch();
}

/**
 * A label round has closed: count, per answer, how often it was asked, found, and missed (the
 * teacher's final table), and pick one missed question for the projector to show — anonymously.
 * Missed is two counts, kept apart: `wrong` (drove into another label) and `none` (never touched an
 * orb at all — froze, or was simply the last car when the round closed; the two cannot be told apart).
 */
function tallyLabels(game, r, pool) {
  const mn = game.ko;
  mn.labels = mn.labels || {};
  const missed = [];
  for (const p of pool) {
    const q = questionFor(game, p, r.n);
    const s = mn.labels[q.answer] || (mn.labels[q.answer] = { asked: 0, safe: 0, wrong: 0, none: 0 });
    s.asked++;
    if (p.ko.held.length) s.safe++;
    if (p.ko.ate.length) { s.wrong++; missed.push(p); } else if (!p.ko.held.length) s.none = (s.none || 0) + 1;
  }
  const pick = missed.length ? missed[Math.floor(rng(game.seed, `${r.n}:look`)() * missed.length)] : null;
  mn.look = pick ? { pid: pick.id, n: r.n } : null;
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
  if (!r.closed) { io.later(r.closesAt - at + 200, () => { if (game.ko.round === r && !r.closed) closeRound(game, io); }); armPowerups(game, r, io); }
  else io.later((r.revealUntil || at) - at, () => { if (game.ko.round === r) next(game, io); });
}

/** Still driving first (points break a tie); then whoever lasted longest (points again). */
function standings(game) {
  return seated(game).sort((a, b) => (b.ko.in - a.ko.in)
    || (a.ko.in ? 0 : b.ko.outRound - a.ko.outRound || b.ko.outAt - a.ko.outAt)
    || b.ko.pts - a.ko.pts
    || a.name.localeCompare(b.name));
}

/** The scoreboard: points, most first. */
function scoreboard(game) {
  return seated(game).sort((a, b) => b.ko.pts - a.ko.pts || b.ko.grabbed - a.ko.grabbed || a.name.localeCompare(b.name));
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

/**
 * A position report (about twice a second, and at once after a bump). Cosmetic for everyone else;
 * the anchor for grabs. The velocity lets the other screens lead the car between reports, which is
 * what makes two devices agree on where a collision happened. It is clamped to the top speed.
 */
function position(game, player, x, y, at, v) {
  const r = game.ko && game.ko.round;
  const m = player.ko;
  x = Number(x); y = Number(y);
  if (!r || !m.in || !Number.isFinite(x) || !Number.isFinite(y)) return;
  Object.assign(m, { x: Math.min(r.world.w, Math.max(0, Math.round(x))), y: Math.min(r.world.h, Math.max(0, Math.round(y))), posAt: at });
  const top = TUNE.speed * TUNE.topMult;
  const vx = Number(v && v.vx); const vy = Number(v && v.vy);
  if (Number.isFinite(vx) && Number.isFinite(vy)) {
    const k = Math.min(1, top / (Math.hypot(vx, vy) || 1));
    m.vx = Math.round(vx * k); m.vy = Math.round(vy * k);
  }
}

/** Everyone in the arena, for the other screens: [id, x, y, chips held, vx, vy, boosting (1/0)]. */
function carFrame(game, at = Date.now()) {
  return drivers(game).filter((p) => p.ko.x != null).map((p) => [p.id, p.ko.x, p.ko.y, p.ko.held.length, p.ko.vx || 0, p.ko.vy || 0, p.ko.boostUntil > at ? 1 : 0]);
}

// ---------------------------------------------------------------------------
// views
// ---------------------------------------------------------------------------

/** A chip as a screen may see it. Whether it is correct is sent only once the round has closed. */
function chipView(c, closed, mine) {
  const v = { id: c.id, text: c.text, x: c.x, y: c.y, vx: c.vx, vy: c.vy, t0: c.t0, taken: c.by ? 1 : 0 };
  // a label orb is right or wrong only for a given car: `mine` is that car's answer (undefined on the projector)
  if (closed) Object.assign(v, c.ok == null ? { ok: mine == null ? null : c.text === mine, hits: c.hits } : { ok: c.ok, val: c.val, hits: c.hits });
  return v;
}

/** Was this player a car in the round on the table (still in, or the one it knocked out)? */
const inRound = (r, m) => m.in || m.outRound === r.n;

function roundView(game, at = Date.now(), viewer = null) {
  const r = game.ko.round;
  if (!r) return null;
  const mine = r.kind === 'labels' && viewer && inRound(r, viewer.ko) ? questionFor(game, viewer, r.n).label : undefined;
  const v = { n: r.n, kind: r.kind || 'facts', target: r.target, world: r.world, openedAt: r.openedAt, goAt: r.goAt || r.openedAt, closesAt: r.closesAt, closed: r.closed, revealUntil: r.revealUntil, cars: r.cars,
    chips: r.chips.map((c) => chipView(c, r.closed, mine)),
    // a power-up is in the view only once it has popped in (and while the round is open)
    powerups: r.closed ? [] : (r.powerups || []).filter((p) => p.at <= at).map((p) => ({
      id: p.id, kind: p.kind, x: p.x, y: p.y, vx: p.vx, vy: p.vy, t0: p.t0, until: p.until, taken: p.by ? 1 : 0, by: p.byName || null })) };
  if (r.closed) {
    const worst = r.chips.filter((c) => !c.ok && c.hits).sort((a, b) => b.hits - a.hits)[0];
    Object.assign(v, { out: r.out, spared: r.spared || [], nobodyOut: r.nobodyOut, worst: worst ? { text: worst.text, val: worst.val, hits: worst.hits } : null });
  }
  return v;
}

const tune = (game) => {
  const size = game && kindOf(game) === 'labels' ? TUNE.label : TUNE; // label orbs are smaller
  return { maxHold: TUNE.maxHold, holdSlow: TUNE.holdSlow, points: TUNE.points, wrongCost: TUNE.wrongCost, speed: TUNE.speed, topMult: TUNE.topMult, chipR: size.chipR, eatDist: size.eatDist, margin: TUNE.margin, slowMs: TUNE.slowMs,
    boost: { ...TUNE.boost }, bump: { ...TUNE.bump }, power: { r: TUNE.power.r, eat: TUNE.power.eat, pts: { ...TUNE.power.pts } } };
};

function summary(game, at) {
  const all = seated(game);
  return { gateAt: game.ko.gateAt, gateOpen: gateOpen(game, at), alive: all.filter((p) => p.ko.in).length, of: all.length, ending: game.ko.ending, kind: kindOf(game), tune: tune(game) };
}

function place(game, player) {
  const order = game.ko.order || standings(game).map((p) => p.id);
  return order.indexOf(player.id) + 1;
}

function playerKnockout(game, player, at) {
  const m = player.ko;
  const r = game.ko.round;
  const v = { ...summary(game, at), round: roundView(game, at, player),
    in: m.in, ...benchView(m), held: m.held.length, mine: m.held.slice(), slowUntil: m.slowUntil, boosts: m.boosts, boostUntil: m.boostUntil,
    grabbed: m.grabbed, comebacks: m.comebacks, wrong: m.wrong,
    pts: m.pts, roundPts: m.roundPts, rank: scoreboard(game).indexOf(player) + 1,
    champ: (() => { const c = champions(game); const i = c.indexOf(player); return { rank: i < 0 ? null : i + 1, top: c[0] ? { name: c[0].name, pts: c[0].ko.benchPts, me: c[0] === player } : null }; })(),
    spawn: m.x == null ? null : { x: m.x, y: m.y, round: m.spawn } };
  // a label round: this car's own question — and its answer only once the round has closed
  if (r && r.kind === 'labels' && inRound(r, m)) {
    const q = questionFor(game, player, r.n);
    v.q = { n: r.n, fig: q.fig, ask: q.ask };
    if (r.closed) Object.assign(v.q, { label: q.label, answer: q.answer, tell: q.tell, got: m.held.length > 0 });
  }
  if (game.phase === 'over') {
    const w = game.ko.winner && game.players.get(game.ko.winner);
    Object.assign(v, { place: place(game, player), winner: w ? { name: w.name, me: w.id === player.id } : null, sole: !!game.ko.sole });
  }
  return v;
}

/** The projector's "one to look at": a question someone missed last round, with its answer — nobody named. */
function lookView(game) {
  const mn = game.ko; const r = mn.round;
  if (!r || !mn.look || (mn.look.n !== r.n && mn.look.n !== r.n - 1) || (mn.look.n === r.n && !r.closed)) return null;
  const p = game.players.get(mn.look.pid);
  if (!p) return null;
  const q = questionFor(game, p, mn.look.n);
  return { n: mn.look.n, fig: q.fig, answer: q.answer, tell: q.tell };
}

function hostKnockout(game, at) {
  const all = seated(game);
  return { ...summary(game, at), round: roundView(game, at), look: kindOf(game) === 'labels' ? lookView(game) : null,
    arena: all.filter((p) => p.ko.in).map((p) => ({ id: p.id, name: p.name, held: p.ko.held.length })),
    bench: all.filter((p) => !p.ko.in).sort((a, b) => b.ko.ready - a.ko.ready || b.ko.benchPts - a.ko.benchPts)
      .map((p) => ({ id: p.id, name: p.name, row: p.ko.row, since: p.ko.since, ready: p.ko.ready, pts: p.ko.benchPts })),
    scores: scoreboard(game).slice(0, 8).map((p) => ({ id: p.id, name: p.name, pts: p.ko.pts, in: p.ko.in })),
    champs: champions(game).slice(0, 5).map((p) => ({ name: p.name, pts: p.ko.benchPts })) };
}

function finalKnockout(game) {
  const order = standings(game);
  const w = game.ko.winner && game.players.get(game.ko.winner);
  const best = (key) => { const p = [...order].sort((a, b) => b.ko[key] - a.ko[key])[0]; return p && p.ko[key] > 0 ? { name: p.name, n: p.ko[key] } : null; };
  return {
    winner: w ? w.name : null, sole: !!game.ko.sole, rounds: game.ko.rounds, kind: kindOf(game),
    // label games: which answers gave trouble (asked = cars that had it; of those, wrong = drove into another
    // label first, none = never touched an orb). Most trouble first: the share that was wrong or never found.
    labels: Object.entries(game.ko.labels || {}).map(([answer, s]) => ({ answer, ...s, none: s.none || 0 }))
      .sort((a, b) => (b.wrong + b.none) / Math.max(1, b.asked) - (a.wrong + a.none) / Math.max(1, a.asked) || b.asked - a.asked),
    standings: order.map((p, i) => ({ place: i + 1, name: p.name, alive: p.ko.in, outRound: p.ko.outRound || null,
      pts: p.ko.pts, grabbed: p.ko.grabbed, firsts: p.ko.firsts, wrong: p.ko.wrong, comebacks: p.ko.comebacks, benchRight: p.ko.benchRight, benchPts: p.ko.benchPts,
      powers: p.ko.powers || 0, bonus: p.ko.bonus || 0, saved: !!p.userId })),
    champion: best('benchPts'),
    awards: { scorer: best('pts'), first: best('firsts'), comeback: best('comebacks'), powers: best('powers') },
  };
}

/** The rules as the lobby states them — the same numbers the server plays. */
function rules(game) {
  const kind = kindOf(game);
  return { kind, thinkSec: kind === 'labels' ? TUNE.label.thinkMs / 1000 : 0,
    orbs: kind === 'labels' ? dealPlay(game.drill, game.playbook, `${game.seed}:rules`, 1).choices.map((c) => orbText(game, strip(c.html))) : null,
    maxHold: TUNE.maxHold, points: { ...TUNE.points }, wrongCost: TUNE.wrongCost, comeback: TUNE.comeback, comebackTotal: TUNE.comebackTotal, benchPoints: TUNE.benchPoints.slice(), fluentSec: TUNE.fluentMs / 1000,
    gateSec: game.seconds, roundSec: game.secondsPerPlay, slowSec: TUNE.slowMs / 1000,
    boostMax: TUNE.boost.max, boostSec: TUNE.boost.ms / 1000, powerPts: Object.values(TUNE.power.pts).sort((a, b) => b - a), powerSec: TUNE.power.life / 1000,
    bumps: true, ghostSafe: TUNE.bump.ghostSafe };
}

module.exports = {
  kindOf, playable, questionFor, dealPowerups, powerShowing, BOOKS, TUNE, FORMS, makeChips, valueOf, worldFor, chipAt, bounce, rng,
  reset, resetPlayer, start, grab, fire, closeRound, rearm, finish, standings, scoreboard, pointsFor, drivers,
  bench, onBenchAnswer, champions, position, carFrame,
  playerKnockout, hostKnockout, finalKnockout, rules,
};
