/**
 * Live Two-Minute Drill — King of the Hill (a third game type beside Team Drive and Huddle).
 *
 * Every student climbs the same hill on their own, at their own pace, against one shared clock.
 * A right answer climbs (the drill's speed tiers: Math Facts +6/+4/+2), a wrong one slips (the
 * drill's sack). Whoever is highest wears the crown; highest at the buzzer wins.
 *
 * Knockdowns — the part that makes it a game, and the part that could make it mean:
 *   - Every third right answer in a row rolls a BOULDER, and it always lands on the climber
 *     DIRECTLY ABOVE you. Nobody picks a target, so nobody can be ganged up on, and a knockdown
 *     only ever travels downhill: the leaders take the heat, a student near the bottom is never
 *     the one knocked. (Owner's call, 2026-10-20.)
 *   - A climber who was just knocked down is steady for STEADY_MS: a boulder skips them and hits
 *     the next climber up, so two classmates in a row can't pin one student to the floor.
 *   - The king has nobody above. A king's third in a row raises a SHIELD instead, which stops the
 *     next boulder that reaches them.
 *
 * State lives on the game (`game.hill`) and on each player (`h`, `shield`, …); games.js calls in
 * here from the same answer path Team Drive uses.
 */

const SUMMIT = 100;
const KNOCK = 15;
const BOULDER_EVERY = 3;
const STEADY_MS = 4000;

function reset(game) {
  game.hill = { king: null, kingSince: null };
  for (const p of game.players.values()) resetPlayer(p);
}

function resetPlayer(p) {
  Object.assign(p, { h: 0, hAt: 0, peak: 0, shield: false, steadyUntil: 0, reignMs: 0, thrown: 0, taken: 0, lastHit: null });
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

/**
 * One graded answer on the hill. `res` is applyAnswer's result ({ ok, gain }); returns what
 * happened on the hill, for the student's screen and the projector's feed.
 */
function onAnswer(game, player, res, at, push) {
  setHeight(player, player.h + res.gain, at);
  const out = { h: player.h, threw: null, shield: false };
  if (res.ok && player.streak > 0 && player.streak % BOULDER_EVERY === 0) {
    const order = standings(game);
    const i = order.indexOf(player);
    // walk up from directly above: the first climber who isn't steady takes it
    let target = null;
    for (let j = i - 1; j >= 0; j--) {
      if (order[j].steadyUntil <= at) { target = order[j]; break; }
    }
    if (i === 0) {
      if (!player.shield) { player.shield = true; out.shield = true; push({ type: 'shield', who: player.name }); }
    } else if (target && target.shield) {
      target.shield = false;
      out.threw = { name: target.name, blocked: true };
      push({ type: 'blocked', who: player.name, target: target.name });
    } else if (target) {
      setHeight(target, target.h - KNOCK, at);
      target.steadyUntil = at + STEADY_MS;
      target.taken++;
      target.lastHit = { by: player.name, at };
      player.thrown++;
      out.threw = { name: target.name, blocked: false };
      push({ type: 'knock', who: player.name, target: target.name });
    }
  }
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
  return {
    summit: SUMMIT,
    h: player.h,
    rank: i + 1,
    of: order.length,
    king: king ? { name: king.name, h: king.h, me: king.id === player.id } : null,
    above: above ? { name: above.name, gap: Math.round((above.h - player.h) * 10) / 10 } : null,
    toBoulder: BOULDER_EVERY - (player.streak % BOULDER_EVERY),
    shield: player.shield,
    steady: player.steadyUntil > at,
    hit: player.lastHit && at - player.lastHit.at < 6000 ? { by: player.lastHit.by } : null,
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

const RULES = { summit: SUMMIT, knock: KNOCK, boulderEvery: BOULDER_EVERY, steadySec: STEADY_MS / 1000 };

module.exports = { SUMMIT, KNOCK, BOULDER_EVERY, STEADY_MS, RULES, reset, resetPlayer, standings, onAnswer, finish, hostHill, playerHill, finalHill };
