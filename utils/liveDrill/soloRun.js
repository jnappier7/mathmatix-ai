/**
 * Solo runs the SERVER scores — the honest basis for a class leaderboard.
 *
 * The solo page (/drill) deals whole plays to the browser, answers included, and the browser
 * reports its own score (models/drillResult.js: SELF-REPORTED, fine for private practice). A
 * leaderboard changes that: once classmates compare scores, a score a phone can simply post is
 * worth nothing. So a drill marked `graded` in engine.js DRILLS (the fluency games) runs here
 * instead, the way a live game does — the server deals play n from the run's seed, times it from
 * the moment it was fetched, grades the answer, and keeps the score; the phone only ever sees a
 * play's answer after it has answered. The finished run is filed as a DrillResult with
 * `graded: true`, and ONLY graded rounds count on the board (routes/liveDrill.js runRouter).
 *
 * Asynchronous by design (owner, 2026-11-12: "asynch"): no host, no code, no class clock — a
 * student plays whenever, against their own best and the class's. Runs live in memory with a
 * short life (a run is a few minutes; nothing here needs to survive a deploy — a run cut off by
 * one is a run to play again), keyed by an unguessable id that is the run's bearer token.
 */
const crypto = require('crypto');
const { DRILLS, dealPlay, publicPlay, resolvePlaybook, RECENT } = require('./engine');
const { SCORING } = require('./games');
const facts = require('./facts');
const { HUBS } = require('./solo');

const SECONDS = [60, 120, 180, 300];
const DEFAULT_SECONDS = 120;
const GRACE_MS = 2500; // an answer in flight when the clock hits zero still counts
const KEEP_MS = 15 * 60 * 1000; // a finished run stays readable this long
const MAX_RUNS = 5000;
const MAX_PLAYS = 400;

const runs = new Map();
let _now = () => Date.now();

class RunError extends Error { constructor(status, message) { super(message); this.status = status; } }

const scoringFor = (drill) => SCORING[(DRILLS[drill] || {}).scoring] || SCORING.standard;
const isGraded = (drill) => !!(DRILLS[drill] && DRILLS[drill].graded);
/** The hub a drill is filed under (the first one that lists it). */
function hubOf(drill) {
  for (const [id, h] of Object.entries(HUBS)) if (h.games.some((g) => g.drill === drill)) return id;
  return null;
}

function sweep() {
  const t = _now();
  for (const [id, r] of runs) if (r.endsAt + KEEP_MS < t) runs.delete(id);
  if (runs.size > MAX_RUNS) { // oldest first
    const old = [...runs.values()].sort((a, b) => a.startedAt - b.startedAt).slice(0, runs.size - MAX_RUNS);
    for (const r of old) runs.delete(r.id);
  }
}

/**
 * Start a run. `user` is the signed-in account (or null for a guest, whose run is scored the same
 * but saved nowhere). Returns what the page needs: the id, the clock, the scoring tiers.
 */
function start({ drill, playbook, seconds, user }) {
  if (!isGraded(drill)) throw new RunError(400, 'That game is not scored on the server.');
  sweep();
  const pb = resolvePlaybook(drill, playbook);
  const secs = SECONDS.includes(Number(seconds)) ? Number(seconds) : DEFAULT_SECONDS;
  const sc = scoringFor(drill);
  const t = _now();
  const run = {
    id: crypto.randomBytes(16).toString('hex'),
    drill, playbook: pb.key, playbookName: pb.name, hub: hubOf(drill),
    userId: user ? String(user._id) : null,
    seed: crypto.randomBytes(12).toString('hex'),
    seconds: secs, startedAt: t, endsAt: t + secs * 1000,
    n: 0, issuedAt: 0, recent: [],
    score: 0, right: 0, att: 0, streak: 0, longest: 0, misses: [],
    over: false, saved: null,
  };
  runs.set(run.id, run);
  return {
    id: run.id, drill, playbook: run.playbook, playbookName: run.playbookName, seconds: secs,
    startedAt: run.startedAt, endsAt: run.endsAt, now: t,
    scoring: { gains: sc.gains, withinMs: sc.driveMs, miss: sc.sack },
  };
}

function get(id) {
  const run = runs.get(String(id || ''));
  if (!run) throw new RunError(404, 'That round is over or never started.');
  return run;
}
const clockOut = (run, t) => t > run.endsAt + GRACE_MS;

/** The play the student is on. Its clock starts the first time it is fetched. */
function play(id) {
  const run = get(id);
  const t = _now();
  if (run.over || clockOut(run, t)) throw new RunError(409, 'The clock has run out.');
  if (run.n >= MAX_PLAYS) throw new RunError(409, 'That is every play this round has.');
  const p = dealPlay(run.drill, run.playbook, run.seed, run.n + 1, run.recent);
  if (!run.issuedAt) run.issuedAt = t;
  return { n: run.n + 1, play: publicPlay(p), endsAt: run.endsAt, now: t };
}

/** What a student sent, as the grader compares it — a typed number or one of the choices. */
function readAnswer(p, k) {
  if (p.input === 'number') {
    const v = facts.normalizeTyped(k);
    if (v === null) throw new RunError(400, 'Type a number.');
    return v;
  }
  if (!p.choices.some((c) => c.k === k)) throw new RunError(400, 'Not one of the choices.');
  return k;
}

/** Grade play n. The server's clock, the server's tiers, the server's score. */
function answer(id, n, k) {
  const run = get(id);
  const t = _now();
  if (run.over || clockOut(run, t)) throw new RunError(409, 'The clock has run out.');
  if (Number(n) !== run.n + 1 || !run.issuedAt) throw new RunError(409, 'That play is already over.');
  const p = dealPlay(run.drill, run.playbook, run.seed, run.n + 1, run.recent);
  const given = readAnswer(p, k);
  const ms = Math.max(0, t - run.issuedAt);
  const sc = scoringFor(run.drill);
  const ok = given === p.answer;
  let gain; let tier = null;
  run.att++;
  if (ok) {
    tier = ms <= sc.driveMs[0] ? 0 : ms <= sc.driveMs[1] ? 1 : 2;
    gain = sc.gains[tier];
    run.right++; run.streak++; run.longest = Math.max(run.longest, run.streak);
  } else {
    gain = -sc.sack;
    run.streak = 0;
    run.misses.push({ n: run.n + 1, k: given });
  }
  run.score = Math.max(0, run.score + gain);
  run.n++; run.issuedAt = 0;
  run.recent = [p.id, ...run.recent].slice(0, RECENT);
  return {
    n, ok, gain, tier, ms, picked: given,
    answer: p.answer, answerHtml: p.answerHtml, tell: p.tell, revealCard: p.revealCard,
    score: run.score, streak: run.streak, right: run.right, att: run.att,
  };
}

/**
 * Close the run and, for a signed-in student, file it (graded). Idempotent: a second call
 * answers the same totals. `save` is the persistence hook (the route passes the DrillResult
 * write), kept out of here so the rules stay testable without Mongo.
 */
async function finish(id, save) {
  const run = get(id);
  if (!run.over) {
    run.over = true;
    if (run.userId && run.att > 0 && typeof save === 'function') {
      try {
        run.saved = await save({
          userId: run.userId, hub: run.hub, drill: run.drill, playbook: run.playbook, seconds: run.seconds, focus: [],
          score: run.score, right: run.right, attempted: run.att, streak: run.longest, graded: true, playedAt: new Date(_now()),
        });
      } catch (err) {
        run.saved = { error: err.message }; // the round happened either way; the page says what it can
      }
    }
  }
  return {
    id: run.id, drill: run.drill, playbook: run.playbook, seconds: run.seconds,
    score: run.score, right: run.right, att: run.att, longest: run.longest, misses: run.misses.slice(),
    saved: !!(run.saved && !run.saved.error), best: run.saved && run.saved.best ? run.saved.best : null,
  };
}

module.exports = {
  SECONDS, DEFAULT_SECONDS, GRACE_MS, KEEP_MS, MAX_PLAYS, RunError,
  isGraded, hubOf, start, play, answer, finish,
  _reset: () => runs.clear(), _setNow: (fn) => { _now = fn || (() => Date.now()); }, _size: () => runs.size,
  _seedOf: (id) => get(id).seed, // tests only: re-deal the server's plays to answer them on purpose
};
