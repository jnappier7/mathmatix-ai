/**
 * Live Two-Minute Drill — King of the Hill (a third game type beside Team Drive and Huddle).
 *
 * Every student climbs the same hill on their own, at their own pace, against one shared clock.
 * A right answer climbs (the drill's speed tiers: Math Facts +6/+4/+2), a wrong one slips (the
 * drill's sack). Whoever is highest wears the crown; highest at the buzzer wins.
 *
 * Boulders — the part that makes it a game, and the part that could make it mean:
 *   - Every third right answer in a row earns a BOULDER, and the thrower PICKS who takes it
 *     (owner, 2026-11-18: "allow choice of who to attack") — but only from BELOW: the choice is
 *     the climbers above them, within REACH. Nobody can be knocked by someone higher up, so a
 *     student near the bottom is never the one hit, and a leader who breaks away is out of reach
 *     until the pack closes in. The thrower may also keep climbing and throw nothing.
 *   - Crabs in a pot (everyone pulling the leader down so nobody climbs) is held off four ways:
 *     reach (the pack can only pull on what it can reach), STEADY (a climber who was just hit
 *     cannot be hit again for STEADY_MS, so a class cannot pile on one student — at most one
 *     boulder per climber per window, whoever throws), shields (anyone's fifth in a row raises
 *     one, and it eats a boulder whole), and a knock priced in the drill's own tiers — half a fast
 *     answer plus a tenth of the target's height — so a throw costs its target about one answer
 *     and the thrower a moment of the clock; climbing stays the better use of a streak.
 *   - The king has nobody above, so a king's third in a row throws nothing. The crown is heavy
 *     (the king climbs at half speed), which is what keeps the top contested.
 *   Numbers and the playtests behind them: TUNE below.
 *
 * State lives on the game (`game.hill`) and on each player (`h`, `shield`, `boulder`, …);
 * games.js calls in here from the same answer path Team Drive uses.
 */

const SUMMIT = 100;
const BOULDER_EVERY = 3;
// The balance knobs. 2026-10-20: a 12-student class at human speed, then 200 simulated games per
// setting — a flat −15 knock and a shield on every king 3-in-a-row let the fastest student summit at
// ~50 s and hold the crown ~104 of 120 s. 2026-11-18, after a class game on a fluency drill (the
// owner: "boulders push back too far"): the knock had been a flat 10 + 15% whatever the drill paid,
// which on Math Facts tiers (+6/+4/+2) was two or three answers per hit and pinned everyone near
// the base. It is now priced in the drill's own fast answer, shields are for everyone, and the
// thrower picks the target from the climbers within reach above them. A 12-bot class that ALWAYS
// throws at the leader (tests/unit/liveDrillHill.test.js "crabs in a pot") wins at about the rate
// it does throwing nothing, so ganging up on the leader doesn't pay.
const TUNE = {
  kingDrag: 0.5, // the crown is heavy: the king's climbs are half as long
  knockFast: 0.5, // a boulder takes this many FAST answers (the drill's top gain) …
  knockPct: 0.10, //   … plus this share of the target's height: Math Facts 3 → 13, a course drill 7.5 → 17.5
  shieldEvery: 5, // anyone's fifth in a row raises a shield (one at a time; it stops one boulder) — not a multiple of 3, so shields and boulders interleave
  reach: 30, // a boulder reaches a climber at most this far above the thrower
  steadyMs: 6000, // a climber who was just hit cannot be hit again for this long
};
const STEADY_MS = () => TUNE.steadyMs;
/** How far a boulder knocks a climber at height h, in the drill's own tiers. */
const knockAt = (h, sc) => TUNE.knockFast * sc.gains[0] + TUNE.knockPct * h;

class HillError extends Error { constructor(status, message) { super(message); this.status = status; } }

function reset(game) {
  game.hill = { king: null, kingSince: null };
  for (const p of game.players.values()) resetPlayer(p);
}

function resetPlayer(p) {
  Object.assign(p, { h: 0, hAt: 0, peak: 0, shield: false, steadyUntil: 0, reignMs: 0, thrown: 0, taken: 0, lastHit: null, boulder: null });
}

const climbers = (game) => [...game.players.values()].filter((p) => !p.kicked);

/** Everyone, highest first. A tie goes to whoever got to that height first. */
function standings(game) {
  return climbers(game).sort((a, b) => b.h - a.h || (a.hAt || 0) - (b.hAt || 0));
}

function setHeight(p, h, at) {
  const v = Math.max(0, Math.min(SUMMIT, h));
  if (v !== p.h) { p.h = v; p.hAt = at; }
  p.peak = Math.max(p.peak, p.h);
}

/** Close out the current reign and crown whoever is on top now. Returns the new king if it changed. */
function recrown(game, at) {
  const top = standings(game)[0];
  const next = top && top.h > 0 ? top : null;
  const cur = game.hill.king ? game.players.get(game.hill.king) : null;
  if ((next && next.id) === (cur && cur.id)) return null;
  if (cur) cur.reignMs += at - game.hill.kingSince;
  game.hill.king = next ? next.id : null;
  game.hill.kingSince = at;
  return next;
}

/** The climbers a boulder from `player` can reach right now: strictly above, within reach, not steady — nearest first. */
function inReach(game, player, at) {
  return climbers(game)
    .filter((p) => p !== player && p.h > player.h && p.h - player.h <= TUNE.reach && p.steadyUntil <= at)
    .sort((a, b) => a.h - b.h || (b.hAt || 0) - (a.hAt || 0));
}

const describe = (game, player, p) => ({
  id: p.id, name: p.name, h: Math.round(p.h), gap: Math.round((p.h - player.h) * 10) / 10,
  king: game.hill.king === p.id, shield: p.shield,
});

/** The choice a pending boulder offers, as the phone shows it (re-read each time: whoever is still above and not steady). */
function pickOptions(game, player, at) {
  if (!player.boulder) return [];
  const ids = new Set(player.boulder.options);
  return inReach(game, player, at).filter((p) => ids.has(p.id)).map((p) => describe(game, player, p));
}

/**
 * One graded answer on the hill. `res` is applyAnswer's result ({ ok, gain }); `sc` the drill's
 * scoring. Returns what happened, for the student's screen and the projector's feed. A third in a
 * row with someone in reach PARKS a boulder (`player.boulder`): games.js offers the choice before
 * the next play and `throwAt` lands it.
 */
function onAnswer(game, player, res, sc, at, push) {
  const drag = game.hill.king === player.id ? 1 - TUNE.kingDrag : 1;
  const step = res.ok ? Math.round(res.gain * drag * 10) / 10 : res.gain;
  setHeight(player, player.h + step, at);
  const out = { h: player.h, step, threw: null, shield: false, pick: null };
  if (res.ok && player.streak > 0 && player.streak % TUNE.shieldEvery === 0 && !player.shield) {
    player.shield = true; out.shield = true;
    push({ type: 'shield', who: player.name });
  }
  if (res.ok && player.streak > 0 && player.streak % BOULDER_EVERY === 0) {
    const options = inReach(game, player, at);
    if (options.length) {
      player.boulder = { options: options.map((p) => p.id), at };
      out.pick = { kind: 'boulder', options: options.map((p) => describe(game, player, p)) };
    }
  }
  const king = recrown(game, at);
  if (king) push({ type: 'crown', who: king.name });
  return out;
}

/**
 * Land a pending boulder on `targetId` — one of the climbers it was offered, still strictly above
 * and not steady at this moment (a lagging screen cannot hit anyone below, or pile on). `'none'`
 * keeps climbing and throws nothing.
 */
function throwAt(game, player, targetId, sc, at, push) {
  if (!player.boulder) throw new HillError(409, 'No boulder to roll.');
  if (!targetId || targetId === 'none') { player.boulder = null; return { kind: 'boulder', skipped: true }; }
  const target = game.players.get(String(targetId));
  if (!target || target.kicked || !player.boulder.options.includes(target.id) || target.h <= player.h) throw new HillError(400, 'Pick someone above you.');
  if (target.steadyUntil > at) throw new HillError(400, `${target.name} is steady right now — pick someone else, or keep climbing.`);
  player.boulder = null;
  const out = { kind: 'boulder', name: target.name, blocked: false, fall: 0 };
  if (target.shield) {
    target.shield = false;
    out.blocked = true;
    push({ type: 'blocked', who: player.name, target: target.name });
  } else {
    const fall = Math.round(knockAt(target.h, sc) * 10) / 10;
    setHeight(target, target.h - fall, at);
    out.fall = fall;
    target.steadyUntil = at + STEADY_MS();
    target.taken++;
    target.lastHit = { by: player.name, at };
    player.thrown++;
    push({ type: 'knock', who: player.name, target: target.name });
  }
  out.h = target.h;
  const king = recrown(game, at);
  if (king) push({ type: 'crown', who: king.name });
  return out;
}

/** Freeze the reign clock at the buzzer. */
function finish(game, at) {
  const cur = game.hill.king ? game.players.get(game.hill.king) : null;
  if (cur && game.hill.kingSince != null) cur.reignMs += at - game.hill.kingSince;
  game.hill.kingSince = null;
}

const secs = (ms) => Math.round(ms / 100) / 10;

/** The projector's hill: every climber, highest first. */
function hostHill(game, at) {
  const kingId = game.hill.king;
  return {
    summit: SUMMIT,
    climbers: standings(game).map((p) => ({
      id: p.id, name: p.name, h: p.h, king: p.id === kingId, shield: p.shield,
      steady: p.steadyUntil > at, hit: !!(p.lastHit && at - p.lastHit.at < 2500),
    })),
  };
}

/** One student's view of the hill: where they are, who's just above, what's coming. */
function playerHill(game, player, at) {
  const order = standings(game);
  const i = order.indexOf(player);
  const above = i > 0 ? order[i - 1] : null;
  const king = game.hill.king ? game.players.get(game.hill.king) : null;
  const options = pickOptions(game, player, at);
  return {
    summit: SUMMIT,
    h: player.h,
    rank: i + 1,
    of: order.length,
    king: king ? { name: king.name, h: king.h, me: king.id === player.id } : null,
    above: above ? { name: above.name, gap: Math.round((above.h - player.h) * 10) / 10 } : null,
    toBoulder: BOULDER_EVERY - (player.streak % BOULDER_EVERY),
    toShield: player.shield ? 0 : TUNE.shieldEvery - (player.streak % TUNE.shieldEvery),
    shield: player.shield,
    steady: player.steadyUntil > at,
    hit: player.lastHit && at - player.lastHit.at < 6000 ? { by: player.lastHit.by } : null,
    pick: options.length ? { kind: 'boulder', options } : null,
  };
}

/** The final standings and the awards. Call after finish(). */
function finalHill(game) {
  const order = standings(game);
  const reign = [...order].sort((a, b) => b.reignMs - a.reignMs)[0];
  const thrower = [...order].sort((a, b) => b.thrown - a.thrown)[0];
  return {
    standings: order.map((p, i) => ({ place: i + 1, name: p.name, h: p.h, peak: p.peak, comp: p.comp, att: p.att,
      reignSec: secs(p.reignMs), thrown: p.thrown, taken: p.taken })),
    longestReign: reign && reign.reignMs > 0 ? { name: reign.name, sec: secs(reign.reignMs) } : null,
    mostBoulders: thrower && thrower.thrown > 0 ? { name: thrower.name, count: thrower.thrown } : null,
  };
}

/** The hill's rules as the lobby states them — from TUNE and the drill's tiers, so the screen can't drift from the game. */
const rules = (sc) => ({ summit: SUMMIT, knockMin: Math.round(knockAt(0, sc) * 10) / 10, knockMax: Math.round(knockAt(SUMMIT, sc) * 10) / 10,
  boulderEvery: BOULDER_EVERY, shieldEvery: TUNE.shieldEvery, reach: TUNE.reach, steadySec: STEADY_MS() / 1000, kingStepPct: Math.round(100 * (1 - TUNE.kingDrag)) });

module.exports = { SUMMIT, BOULDER_EVERY, get STEADY_MS() { return TUNE.steadyMs; }, TUNE, HillError, knockAt, rules, reset, resetPlayer, standings, inReach, pickOptions, onAnswer, throwAt, finish, hostHill, playerHill, finalHill };
