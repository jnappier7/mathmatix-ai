/**
 * Live Two-Minute Drill — Heist (a fourth game type beside Team Drive, Huddle and King of the Hill).
 *
 * Every student is a solo safecracker on one shared clock, at their own pace. The score is CASH.
 * The dynamics are the ones that make "answer, open a chest, swing the standings" games a hit —
 * a random reward after the work, and comebacks — built our way:
 *
 *   - A right answer pays cash by the drill's speed tiers (×CASH_MULT, so a fast standard play is
 *     $150). A wrong answer TRIPS THE ALARM: a small cash loss and the screen locks for ALARM_MS.
 *     The alarm is the guess-killer that chest games never had: a guesser is right one tap in four
 *     and spends most of the clock watching a countdown, while a student who thinks gets several
 *     plays in the same time. (Owner's problem statement, 2026-11: students guess and guess for
 *     more chances at gold.)
 *   - Every SAFE_EVERY right answers IN A ROW cracks a safe: three safes appear, the student taps
 *     one, the server reveals what was inside. A miss resets the streak, so one guess also throws
 *     away the right answers before it. Most safes hold cash in uneven amounts, some a jackpot, and
 *     a few are twists (OUTCOMES):
 *       grab   — take GRAB_PCT from a player ABOVE you — YOUR PICK (owner, 2026-11-11: "I want
 *                kids to be able to target their classmates, only from below"), so the reveal
 *                offers every richer classmate and the server applies it to the one tapped; a
 *                name below you is never offered and never accepted, so a struggling student is
 *                never robbed. Nobody above → the safe pays cash instead.
 *       switch — swap piles with a player above you, your pick the same way: only ever an
 *                upgrade for the opener, a comeback card, not a bully card. Nobody above → cash.
 *       decoy  — empty. The sting of a wasted streak is the whole cost.
 *       gadget — a one-time trick the FINDER holds and fires when they like (owner's idea):
 *                smoke blurs every other screen for GADGET_MS; flip turns every other screen
 *                upside down. Everyone but the finder, no target. The projector takes it too.
 *   - The three safes are dealt from the game seed (seed, player, safe number), so what is inside
 *     each is fixed the moment they appear: no re-rolls, no lag tricks, and a reconnect shows the
 *     same three.
 *   - Cash never goes below 0. Standings: most cash (tie: whoever got there first).
 *
 * Balance (TUNE / OUTCOMES) is checked by the simulator in tests/unit/liveDrillHeist.test.js: a
 * "thinker" bot (right 85% at human speed) against a "guesser" (right 25%, tapping fast) — the
 * thinker must take four games in five or more, or the alarm/streak/cost numbers are wrong.
 *
 * State lives on the game (`game.heist`) and on each player (`cash`, `safe`, `lockUntil`,
 * `gadgets`, …); games.js calls in here from the same answer path Team Drive uses.
 */

const crypto = require('crypto');

const CASH_MULT = 10; // the drill's yards, as dollars: a fast standard play is $150
const SAFE_EVERY = 3; // right answers in a row per safe
const SAFE_COUNT = 3; // safes offered per crack
const ALARM_MS_MAX = 6000; // the lockout after a wrong answer (capped at the drill's fast tier — Math Facts plays are 3 s)
const GADGET_MS = 6000; // how long a smoke bomb / flip lasts on everyone else's screen
const GRAB_PCT = 0.2; // a grab takes this share of the target's pile
const SHAKE_PCT = 0.1; // a shakedown takes this share from EVERY richer player
const MAX_GADGETS = 3; // a student holds at most this many unfired gadgets

/**
 * What a safe can hold, with the odds of each (weights sum to 100). Cash is in units of the
 * drill's FAST gain × CASH_MULT (standard: $150), so a safe pays about one to three fast answers,
 * the jackpot six. `pick` chooses the outcome of one safe from a uniform [0,1) roll.
 *
 * MORE THAN HALF the safes are a move on someone else (2026-11, owner: a five-minute class game
 * had "maybe a couple" of attacks at the old 21% — the game is the attacks). Every one of them
 * keeps the rule: a random player ABOVE you, or everyone but you; never a chosen target. And
 * every one keeps EVERYONE PLAYING (owner, 2026-11-11: "a swap keeps everyone playing" — a
 * 10-second jail was tried and dropped; a student sitting idle is not in the game):
 *   grab      — GRAB_PCT of one richer player's pile
 *   switch    — trade piles with one richer player
 *   shakedown — SHAKE_PCT from EVERY richer player at once
 *   gadget    — smoke / flip, held and fired at everyone else (a nuisance, never a lockout)
 */
const OUTCOMES = [
  { kind: 'cash', units: 1, weight: 15, label: 'Cash' },
  { kind: 'cash', units: 2, weight: 11, label: 'Cash' },
  { kind: 'cash', units: 3, weight: 7, label: 'Big cash' },
  { kind: 'cash', units: 6, weight: 4, label: 'JACKPOT' },
  { kind: 'grab', weight: 20, label: 'Grab' },
  { kind: 'switch', weight: 14, label: 'Switch' },
  { kind: 'shakedown', weight: 10, label: 'Shakedown' },
  { kind: 'decoy', weight: 6, label: 'Decoy' },
  { kind: 'gadget', weight: 13, label: 'Gadget' },
];
const ATTACKS = ['grab', 'switch', 'shakedown', 'gadget'];
const GADGETS = [
  { kind: 'smoke', label: 'Smoke bomb', blurb: 'blurs everyone else\'s screen for 6 seconds' },
  { kind: 'flip', label: 'Flip', blurb: 'turns everyone else\'s screen upside down for 6 seconds' },
];

const TUNE = { cashMult: CASH_MULT, safeEvery: SAFE_EVERY, grabPct: GRAB_PCT, shakePct: SHAKE_PCT, gadgetMs: GADGET_MS, alarmMsMax: ALARM_MS_MAX };

/** mulberry32, seeded from (game seed, player, safe number): the same three safes every time. */
function rng(seed, playerId, safeNo) {
  let a = crypto.createHash('sha256').update(`${seed}:safe:${playerId}:${safeNo}`).digest().readUInt32LE(0);
  return function next() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(roll) {
  let acc = 0;
  for (const o of OUTCOMES) { acc += o.weight; if (roll * 100 < acc) return o; }
  return OUTCOMES[OUTCOMES.length - 1];
}

/** Deal the SAFE_COUNT safes of a player's n-th crack. Server-side only until one is opened. */
function dealSafes(game, player, safeNo) {
  const next = rng(game.seed, player.id, safeNo);
  return Array.from({ length: SAFE_COUNT }, () => {
    const o = pick(next());
    const out = { kind: o.kind, label: o.label };
    if (o.kind === 'cash') out.units = o.units;
    if (o.kind === 'gadget') out.gadget = GADGETS[Math.floor(next() * GADGETS.length)].kind;
    return out;
  });
}

/** The alarm for this drill: the fast tier at most, never longer than ALARM_MS_MAX. */
const alarmMs = (sc) => Math.min(ALARM_MS_MAX, sc.driveMs[0]);
/** A fast answer's cash for this drill — the unit every safe is priced in. */
const unit = (sc) => sc.gains[0] * CASH_MULT;

function reset(game) {
  game.heist = { effects: [], safesCracked: 0 }; // effects: { kind, by, byName, at, until }
  for (const p of game.players.values()) resetPlayer(p);
}

function resetPlayer(p) {
  Object.assign(p, {
    cash: 0, cashAt: 0, peakCash: 0,
    safe: null, // an unopened crack: { n, dealt: [...outcomes], at }
    pick: null, // a grab or switch waiting for its target: { kind, n, at }
    safeNo: 0, safes: 0, // cracks dealt so far / opened
    lockUntil: 0, alarms: 0,
    gadgets: [], // held, unfired: [{ id, kind }]
    fired: 0, grabbed: 0, lost: 0, bigGrab: 0, lastHit: null, // lastHit: { by, kind, amount, at }
  });
}

const crew = (game) => [...game.players.values()].filter((p) => !p.kicked);

/** Everyone, richest first. A tie goes to whoever reached that pile first. */
function standings(game) {
  return crew(game).sort((a, b) => b.cash - a.cash || (a.cashAt || 0) - (b.cashAt || 0));
}

function setCash(p, cash, at) {
  const v = Math.max(0, Math.round(cash));
  if (v !== p.cash) { p.cash = v; p.cashAt = at; }
  p.peakCash = Math.max(p.peakCash, p.cash);
}

/** Players strictly richer than `p` — the only ones a grab or a switch may touch. */
const above = (game, p) => crew(game).filter((q) => q.id !== p.id && q.cash > p.cash);

/** True while the alarm holds this player's screen — the ONLY lock in the game: nothing another
 *  player does ever takes a screen away (a 10-second jail was tried; see OUTCOMES). */
const locked = (p, at) => p.lockUntil > at;

/**
 * One graded answer. `res` is applyAnswer's result ({ ok, gain, tier }); returns what happened,
 * for the student's screen and the projector's feed. `sc` is the drill's scoring.
 */
function onAnswer(game, player, res, sc, at, push) {
  const step = res.gain * CASH_MULT;
  setCash(player, player.cash + step, at);
  const out = { cash: player.cash, step, lockUntil: null, safe: null };
  if (!res.ok) {
    player.lockUntil = at + alarmMs(sc);
    player.alarms++;
    out.lockUntil = player.lockUntil;
    return out;
  }
  if (player.streak > 0 && player.streak % SAFE_EVERY === 0 && !player.safe) {
    player.safeNo++;
    player.safe = { n: player.safeNo, dealt: dealSafes(game, player, player.safeNo), at };
    out.safe = { n: player.safeNo, count: SAFE_COUNT };
    push({ type: 'crack', who: player.name });
  }
  return out;
}

/**
 * The student tapped safe `idx` of their open crack. Applies the outcome and returns it (what to
 * show), never the other two safes' contents — a reconnect must not learn what it didn't pick.
 */
function openSafe(game, player, idx, sc, at, push) {
  const s = player.safe;
  if (!s) throw Object.assign(new Error('No safe to open.'), { status: 409 });
  const i = Number(idx);
  if (!Number.isInteger(i) || i < 0 || i >= s.dealt.length) throw Object.assign(new Error('Pick one of the safes.'), { status: 400 });
  const o = s.dealt[i];
  player.safe = null;
  player.safes++;
  game.heist.safesCracked++;
  const u = unit(sc);
  const result = { kind: o.kind, label: o.label, idx: i, n: s.n, amount: 0, target: null, gadget: null, count: 0 };
  const payCash = (units, label) => { result.kind = 'cash'; result.label = label || o.label; result.amount = units * u; setCash(player, player.cash + result.amount, at); };
  if (o.kind === 'cash') payCash(o.units);
  else if (o.kind === 'decoy') { /* empty */ }
  else if (o.kind === 'gadget') {
    if (player.gadgets.length >= MAX_GADGETS) payCash(1, 'Cash'); // pockets full: cash instead
    else {
      const g = { id: crypto.randomBytes(4).toString('hex'), kind: o.gadget };
      player.gadgets.push(g);
      result.gadget = { ...g, ...GADGETS.find((x) => x.kind === g.kind) };
    }
  } else if (o.kind === 'shakedown') {
    // SHAKE_PCT from everyone richer, all at once — nobody richer, and the safe pays out instead
    const pool = above(game, player);
    if (!pool.length) payCash(2, 'Cash');
    else {
      let total = 0;
      for (const t of pool) {
        const amt = Math.round(t.cash * SHAKE_PCT);
        setCash(t, t.cash - amt, at);
        t.lost += amt; t.lastHit = { by: player.name, kind: 'shakedown', amount: amt, at };
        total += amt;
      }
      setCash(player, player.cash + total, at);
      player.grabbed += total; player.bigGrab = Math.max(player.bigGrab, total);
      result.amount = total; result.count = pool.length;
      push({ type: 'shakedown', who: player.name, count: pool.length, amount: total });
    }
  } else {
    // a grab or a switch: the opener picks the target from the classmates above them (pickTarget)
    const pool = above(game, player);
    if (!pool.length) payCash(2, 'Cash'); // nobody richer to rob: the safe pays out instead
    else {
      player.pick = { kind: o.kind, n: s.n, at };
      result.choose = pickOptions(game, player);
    }
  }
  if (result.kind === 'cash') push({ type: result.amount >= 6 * u ? 'jackpot' : 'safe', who: player.name, amount: result.amount });
  result.cash = player.cash;
  return result;
}

/** Who a pending grab or switch may land on: every classmate strictly richer, richest first. */
function pickOptions(game, player) {
  return above(game, player).sort((a, b) => b.cash - a.cash || (a.cashAt || 0) - (b.cashAt || 0))
    .map((t) => ({ id: t.id, name: t.name, cash: t.cash }));
}

/**
 * The student tapped a classmate for their pending grab or switch. Only a player ABOVE them at
 * this moment is accepted — a name below is refused whatever the screen showed, so a lagging
 * phone can never rob down. If nobody is richer any more, the safe pays cash instead.
 */
function pickTarget(game, player, targetId, sc, at, push) {
  const pk = player.pick;
  if (!pk) throw Object.assign(new Error('Nothing to pick.'), { status: 409 });
  const u = unit(sc);
  const result = { kind: pk.kind, label: pk.kind === 'grab' ? 'Grab' : 'Switch', n: pk.n, amount: 0, target: null };
  const pool = above(game, player);
  if (!pool.length) {
    player.pick = null;
    result.kind = 'cash'; result.label = 'Cash'; result.amount = 2 * u;
    setCash(player, player.cash + result.amount, at);
    push({ type: 'safe', who: player.name, amount: result.amount });
    result.cash = player.cash;
    return result;
  }
  const t = pool.find((q) => q.id === String(targetId));
  if (!t) throw Object.assign(new Error('Pick someone ahead of you.'), { status: 400 }); // the next fetch offers the fresh list
  player.pick = null;
  if (pk.kind === 'grab') {
    const amt = Math.round(t.cash * GRAB_PCT);
    setCash(t, t.cash - amt, at); setCash(player, player.cash + amt, at);
    t.lost += amt; t.lastHit = { by: player.name, kind: 'grab', amount: amt, at };
    player.grabbed += amt; player.bigGrab = Math.max(player.bigGrab, amt);
    result.amount = amt; result.target = t.name;
    push({ type: 'grab', who: player.name, target: t.name, amount: amt });
  } else {
    const mine = player.cash; const theirs = t.cash;
    setCash(player, theirs, at); setCash(t, mine, at);
    t.lost += theirs - mine; t.lastHit = { by: player.name, kind: 'switch', amount: theirs - mine, at };
    player.grabbed += theirs - mine; player.bigGrab = Math.max(player.bigGrab, theirs - mine);
    result.amount = theirs - mine; result.target = t.name;
    push({ type: 'switch', who: player.name, target: t.name, amount: theirs - mine });
  }
  result.cash = player.cash;
  return result;
}

/** Fire a held gadget: everyone else takes the effect for GADGET_MS. */
function useGadget(game, player, gadgetId, at, push) {
  const i = player.gadgets.findIndex((g) => g.id === String(gadgetId));
  if (i < 0) throw Object.assign(new Error('You don\'t have that gadget.'), { status: 404 });
  const [g] = player.gadgets.splice(i, 1);
  player.fired++;
  const fx = { kind: g.kind, by: player.id, byName: player.name, at, until: at + GADGET_MS };
  game.heist.effects = game.heist.effects.filter((e) => e.until > at);
  game.heist.effects.push(fx);
  push({ type: 'gadget', who: player.name, kind: g.kind });
  return { kind: g.kind, until: fx.until, label: GADGETS.find((x) => x.kind === g.kind).label };
}

/** The effects live right now, newest first; `exceptId` drops the finder's own. */
function liveEffects(game, at, exceptId) {
  return (game.heist.effects || []).filter((e) => e.until > at && e.by !== exceptId)
    .sort((a, b) => b.at - a.at).map((e) => ({ kind: e.kind, by: e.byName, until: e.until }));
}

/** The projector's vault board: everyone, richest first, plus anything live on the screens. */
function hostHeist(game, at) {
  const order = standings(game);
  return {
    crew: order.map((p, i) => ({
      id: p.id, name: p.name, cash: p.cash, rank: i + 1, safes: p.safes, gadgets: p.gadgets.length,
      alarm: locked(p, at), cracking: !!p.safe, hit: !!(p.lastHit && at - p.lastHit.at < 3000),
    })),
    top: order.length ? order[0].cash : 0,
    safesCracked: game.heist.safesCracked,
    effects: liveEffects(game, at, null),
  };
}

/** One student's view: cash, rank, who's just above, the open crack (count only), the alarm, held gadgets. */
function playerHeist(game, player, at) {
  const order = standings(game);
  const i = order.indexOf(player);
  const up = i > 0 ? order[i - 1] : null;
  const leader = order[0] && order[0].cash > 0 ? order[0] : null; // nobody leads an empty vault
  return {
    cash: player.cash,
    rank: i + 1,
    of: order.length,
    leader: leader ? { name: leader.name, cash: leader.cash, me: leader.id === player.id } : null,
    above: up ? { name: up.name, gap: up.cash - player.cash } : null,
    toSafe: player.safe ? 0 : SAFE_EVERY - (player.streak % SAFE_EVERY),
    safe: player.safe ? { n: player.safe.n, count: player.safe.dealt.length } : null,
    pick: player.pick ? { kind: player.pick.kind, options: pickOptions(game, player) } : null,
    alarmUntil: locked(player, at) ? player.lockUntil : null,
    gadgets: player.gadgets.map((g) => ({ ...g, ...GADGETS.find((x) => x.kind === g.kind) })),
    effect: liveEffects(game, at, player.id)[0] || null,
    hit: player.lastHit && at - player.lastHit.at < 8000 ? { by: player.lastHit.by, kind: player.lastHit.kind, amount: player.lastHit.amount } : null,
  };
}

/** The final standings and the awards. */
function finalHeist(game) {
  const order = standings(game);
  const cracker = [...order].sort((a, b) => b.safes - a.safes)[0];
  const thief = [...order].sort((a, b) => b.bigGrab - a.bigGrab)[0];
  return {
    standings: order.map((p, i) => ({ place: i + 1, name: p.name, cash: p.cash, peak: p.peakCash, comp: p.comp, att: p.att,
      safes: p.safes, grabbed: p.grabbed, lost: p.lost, alarms: p.alarms, fired: p.fired })),
    safecracker: cracker && cracker.safes > 0 ? { name: cracker.name, count: cracker.safes } : null,
    biggestGrab: thief && thief.bigGrab > 0 ? { name: thief.name, amount: thief.bigGrab } : null,
    safesCracked: game.heist.safesCracked,
  };
}

/** The rules as the lobby states them — from the constants, so the screen can't drift from the game. */
function rules(sc) {
  const u = unit(sc);
  return {
    cashMult: CASH_MULT,
    pay: sc.gains.map((g) => g * CASH_MULT),
    alarmCost: sc.sack * CASH_MULT,
    alarmSec: alarmMs(sc) / 1000,
    safeEvery: SAFE_EVERY,
    safeCount: SAFE_COUNT,
    cashMin: u, cashMax: 3 * u, jackpot: 6 * u,
    grabPct: Math.round(GRAB_PCT * 100),
    shakePct: Math.round(SHAKE_PCT * 100),
    gadgetSec: GADGET_MS / 1000,
    gadgets: GADGETS.map((g) => ({ kind: g.kind, label: g.label, blurb: g.blurb })),
    odds: Object.fromEntries(['cash', 'grab', 'switch', 'shakedown', 'decoy', 'gadget'].map((k) => [k, OUTCOMES.filter((o) => o.kind === k).reduce((s, o) => s + o.weight, 0)])),
    attackPct: OUTCOMES.filter((o) => ATTACKS.includes(o.kind)).reduce((s, o) => s + o.weight, 0),
  };
}

module.exports = {
  CASH_MULT, SAFE_EVERY, SAFE_COUNT, GADGET_MS, GRAB_PCT, SHAKE_PCT, MAX_GADGETS, OUTCOMES, ATTACKS, GADGETS, TUNE,
  alarmMs, unit, rules, reset, resetPlayer, standings, above, locked, dealSafes,
  onAnswer, openSafe, pickOptions, pickTarget, useGadget, liveEffects, hostHeist, playerHeist, finalHeist,
};
