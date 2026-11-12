/**
 * Server-scored solo runs (utils/liveDrill/soloRun.js) — what makes a class leaderboard honest.
 *
 * What these pin: a run deals from its own seed and the phone never sees an open play's answer;
 * the SERVER times and grades (tiers from the drill's scoring); a wrong answer costs the sack and
 * the score never goes below zero; a stale or repeated answer is refused; the clock ends the run
 * (with a short grace for an answer in flight); the finish files a GRADED round for a student
 * and nothing for a guest, and is idempotent; only drills marked `graded` run here.
 *
 * The tests answer on purpose by re-dealing the server's plays from the run's seed (a test-only
 * hook) — the same deal the engine gives any game.
 */
jest.useFakeTimers();
const R = require('../../utils/liveDrill/soloRun');
const { dealPlay, RECENT } = require('../../utils/liveDrill/engine');
const { SCORING } = require('../../utils/liveDrill/games');

let t0 = 1_700_000_000_000;
beforeEach(() => { t0 = 1_700_000_000_000; R._setNow(() => t0); R._reset(); });
afterAll(() => R._setNow(null));
const tick = (ms) => { t0 += ms; };
const student = { _id: '64b000000000000000000001' };
const sc = SCORING.facts;

/** A player who knows the answers: deals the server's play n itself and answers right or wrong, after `ms`. */
function player(run) {
  const seed = R._seedOf(run.id); let recent = [];
  return {
    go(ok, ms = 900) {
      const served = R.play(run.id);
      const full = dealPlay(run.drill, run.playbook, seed, served.n, recent);
      recent = [full.id, ...recent].slice(0, RECENT);
      expect(served.play.id).toBe(full.id); // the server dealt the play we expected
      tick(ms);
      const k = ok ? full.answer : full.choices.find((c) => c.k !== full.answer).k;
      return R.answer(run.id, served.n, k);
    },
  };
}

describe('a run', () => {
  test('only a graded drill runs here; the clock and the tiers come from the drill', () => {
    expect(() => R.start({ drill: 'geometry', playbook: 'all', seconds: 120, user: null })).toThrow(/not scored/);
    const run = R.start({ drill: 'congruence', playbook: 'all', seconds: 120, user: null });
    expect(run).toMatchObject({ drill: 'congruence', playbook: 'all', playbookName: 'Mixed', seconds: 120, scoring: { gains: sc.gains, withinMs: sc.driveMs, miss: sc.sack } });
    expect(run.endsAt - run.startedAt).toBe(120000);
    expect(run.id).toMatch(/^[0-9a-f]{32}$/);
    expect(R.start({ drill: 'congruence', playbook: 'all', seconds: 999, user: null }).seconds).toBe(R.DEFAULT_SECONDS);
    expect(R.start({ drill: 'congruence', playbook: 'zzz', seconds: 60, user: null }).playbook).toBe('all');
    expect(R.start({ drill: 'congruence', playbook: 'right', seconds: 60, user: null }).playbookName).toBe('Right Triangles');
  });

  test('deals play n without its answer, the same play until it is answered, and refuses a stale or repeated answer', () => {
    const run = R.start({ drill: 'congruence', playbook: 'basic', seconds: 120, user: null });
    const p = R.play(run.id);
    expect(p.n).toBe(1);
    expect(p.play.answer).toBeUndefined();
    expect(p.play.tell).toBeUndefined();
    expect(p.play.revealCard).toBeUndefined();
    expect(p.play.choices.map((c) => c.html)).toEqual(['SSS', 'SAS', 'ASA', 'AAS', 'HL', 'Not congruent']);
    expect(R.play(run.id).play.id).toBe(p.play.id);
    expect(() => R.answer(run.id, 2, 'a')).toThrow(/already over/);
    expect(() => R.answer(run.id, 1, 'z')).toThrow(/Not one of the choices/);
    const res = player(run).go(true);
    expect(res).toMatchObject({ n: 1, ok: true, tier: 0, gain: sc.gains[0], score: sc.gains[0], streak: 1, right: 1, att: 1 });
    expect(res.answer).toMatch(/^[a-f]$/);
    expect(res.revealCard).toMatch(/<svg/);
    expect(res.tell.length).toBeGreaterThan(5);
    expect(R.play(run.id).n).toBe(2);
    expect(() => R.answer(run.id, 1, 'a')).toThrow(/already over/);
  });

  test('right answers pay by speed tier; a wrong one costs the sack and the streak; the score never drops below zero', () => {
    const run = R.start({ drill: 'congruence', playbook: 'all', seconds: 300, user: null });
    const me = player(run);
    expect(me.go(false)).toMatchObject({ ok: false, gain: -sc.sack, score: 0, streak: 0 }); // not below zero
    expect(me.go(true, 1000)).toMatchObject({ tier: 0, gain: sc.gains[0], score: sc.gains[0], streak: 1 });
    expect(me.go(true, sc.driveMs[0] + 300)).toMatchObject({ tier: 1, gain: sc.gains[1], score: sc.gains[0] + sc.gains[1], streak: 2 });
    expect(me.go(true, sc.driveMs[1] + 300)).toMatchObject({ tier: 2, gain: sc.gains[2], streak: 3 });
    const before = sc.gains[0] + sc.gains[1] + sc.gains[2];
    expect(me.go(false)).toMatchObject({ ok: false, gain: -sc.sack, score: before - sc.sack, streak: 0, right: 3, att: 5 });
  });

  test('the clock ends the run, with a short grace for an answer in flight; a finished run is read-only and its finish is idempotent', async () => {
    const run = R.start({ drill: 'congruence', playbook: 'all', seconds: 60, user: null });
    R.play(run.id);
    tick(60000 + R.GRACE_MS - 10);
    expect(() => R.answer(run.id, 1, 'a')).not.toThrow(); // in flight at the buzzer: counts
    tick(1000);
    expect(() => R.play(run.id)).toThrow(/clock/);
    const out = await R.finish(run.id);
    expect(out).toMatchObject({ att: 1, saved: false, best: null });
    expect(() => R.play(run.id)).toThrow(/clock/);
    expect((await R.finish(run.id)).att).toBe(1);
  });

  test('a student\'s finished run is filed GRADED through the save hook; a guest\'s is not; a failed save is survived', async () => {
    const saved = [];
    const run = R.start({ drill: 'congruence', playbook: 'all', seconds: 60, user: student });
    const me = player(run);
    me.go(true); me.go(true); me.go(false); me.go(true, 4000);
    const out = await R.finish(run.id, async (row) => { saved.push(row); return { best: { score: 999 } }; });
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ userId: student._id, hub: 'geometry', drill: 'congruence', playbook: 'all', seconds: 60, graded: true, attempted: 4, right: 3, streak: 2 });
    expect(saved[0].score).toBe(out.score);
    expect(out.score).toBe(2 * sc.gains[0] - sc.sack + sc.gains[1]);
    expect(out).toMatchObject({ saved: true, best: { score: 999 }, longest: 2 });
    expect(out.misses).toEqual([{ n: 3, k: expect.any(String) }]);
    expect((await R.finish(run.id, async () => { throw new Error('no'); })).saved).toBe(true); // already filed; the hook is not called again

    const guest = R.start({ drill: 'congruence', playbook: 'all', seconds: 60, user: null });
    player(guest).go(true);
    const calls = [];
    expect((await R.finish(guest.id, async (row) => { calls.push(row); })).saved).toBe(false);
    expect(calls).toHaveLength(0);

    const bad = R.start({ drill: 'congruence', playbook: 'all', seconds: 60, user: student });
    player(bad).go(true);
    const res = await R.finish(bad.id, async () => { throw new Error('mongo down'); });
    expect(res).toMatchObject({ saved: false, att: 1 }); // the round still answers its totals

    const empty = R.start({ drill: 'congruence', playbook: 'all', seconds: 60, user: student });
    const none = [];
    await R.finish(empty.id, async (row) => { none.push(row); });
    expect(none).toHaveLength(0); // nothing answered, nothing filed
  });

  test('unknown runs are 404s and old runs are swept', () => {
    expect(() => R.play('nope')).toThrow(/over or never started/);
    const run = R.start({ drill: 'congruence', playbook: 'all', seconds: 60, user: null });
    tick(60000 + R.KEEP_MS + 1000);
    R.start({ drill: 'congruence', playbook: 'all', seconds: 60, user: null }); // a start sweeps
    expect(() => R.play(run.id)).toThrow(/over or never started/);
    expect(R.hubOf('congruence')).toBe('geometry');
  });
});
