/**
 * Live Two-Minute Drill — Heist (utils/liveDrill/heist.js through games.js).
 *
 * What these pin — the fairness and anti-guessing rules first, because they are why the mode is
 * safe to run in a classroom:
 *   - a wrong answer trips the ALARM: cash off and the screen locked, no play dealt (so none timed)
 *     until it clears — the guess-killer;
 *   - every third right answer IN A ROW cracks a safe; a miss resets the streak; the three safes
 *     are dealt from the game seed, so a reconnect sees the same three and nothing is re-rolled;
 *   - a grab or a switch lands on a player RICHER than the opener — the opener's own pick from the
 *     classmates above them (owner's call, 2026-11-11), never anyone below — and pays cash
 *     instead when nobody is richer;
 *   - a gadget hits everyone BUT the finder and expires on its own;
 *   - cash never goes below 0; the standings are by cash; the student's view never leaks what was
 *     in the safes they didn't open;
 *   - the SIMULATOR: a thinker beats a guesser at least four games in five.
 */
jest.useFakeTimers();
const G = require('../../utils/liveDrill/games');
const H = require('../../utils/liveDrill/heist');

afterEach(() => G._reset());

let hostN = 0;
function heistGame(opts = {}) {
  return G.createGame({ hostId: `h${++hostN}`, drill: 'geometry', playbook: 'all', mode: 'heist', seconds: 120, ...opts });
}
const wrongKey = (play) => play.choices.find((c) => c.k !== play.answer).k;
/** Answer `p`'s current play: right (fast) or wrong. Returns the answer result. */
function go(g, p, ok = true, ms = 1000) {
  const cur = G.currentPlay(g, p);
  if (!cur.play) throw new Error(`no play: ${JSON.stringify(cur)}`);
  jest.advanceTimersByTime(ms);
  const pl = G.playAt(g, cur.n);
  return G.answer(g, p, cur.n, ok ? pl.answer : wrongKey(pl));
}
/** Three right in a row → a crack. */
function crack(g, p) { let r; for (let i = 0; i < H.SAFE_EVERY; i++) r = go(g, p); return r; }
const sc = G.SCORING.standard;
const U = sc.gains[0] * H.CASH_MULT; // $150: a fast answer, the unit safes are priced in

describe('cash and the alarm', () => {
  test('right answers pay the drill tiers × 10; wrong ones cost the sack × 10 and lock the screen', () => {
    const g = heistGame();
    const a = G.join(g, 'A').player;
    G.start(g);
    expect(go(g, a, true, 1000).heist).toMatchObject({ step: 150, cash: 150, lockUntil: null, safe: null });
    expect(go(g, a, true, 8000).heist.step).toBe(100);
    const r = go(g, a, false);
    expect(r.heist.step).toBe(-50);
    expect(r.heist.cash).toBe(200);
    expect(r.heist.lockUntil).toBe(Date.now() + 6000);
    expect(g.teams.every((t) => t.pts === 0 && t.pos === G.START_POS)).toBe(true); // no football here
  });

  test('while the alarm rings no play is dealt, and an answer is refused; it clears on its own clock', () => {
    const g = heistGame();
    const a = G.join(g, 'A').player;
    G.start(g);
    go(g, a, false);
    const held = G.currentPlay(g, a);
    expect(held.play).toBeUndefined();
    expect(held.alarm).toBe(a.lockUntil);
    expect(() => G.answer(g, a, a.n, 'x')).toThrow(/alarm/i);
    expect(G.playerView(g, a).heist.alarmUntil).toBe(a.lockUntil);
    expect(G.hostView(g).heist.crew[0].alarm).toBe(true);
    jest.advanceTimersByTime(6001);
    expect(G.currentPlay(g, a).play).toBeTruthy();
    expect(G.playerView(g, a).heist.alarmUntil).toBeNull();
  });

  test('the alarm is the drill\'s fast tier at most: 3 s on Math Facts, 6 s on a course drill', () => {
    expect(H.alarmMs(G.SCORING.facts)).toBe(3000);
    expect(H.alarmMs(G.SCORING.standard)).toBe(6000);
    expect(H.alarmMs(G.SCORING.prep)).toBe(6000);
  });

  test('cash never goes below zero', () => {
    const g = heistGame();
    const a = G.join(g, 'A').player;
    G.start(g);
    expect(go(g, a, false).heist.cash).toBe(0);
    jest.advanceTimersByTime(6001);
    expect(go(g, a, false).heist.cash).toBe(0);
  });
});

describe('cracking a safe', () => {
  test('every third right IN A ROW deals three safes; a miss resets the count', () => {
    const g = heistGame();
    const a = G.join(g, 'A').player;
    G.start(g);
    go(g, a); go(g, a);
    expect(G.playerView(g, a).heist.toSafe).toBe(1);
    go(g, a, false); // streak gone
    jest.advanceTimersByTime(6001);
    expect(G.playerView(g, a).heist.toSafe).toBe(3);
    go(g, a); go(g, a);
    const r = go(g, a);
    expect(r.heist.safe).toEqual({ n: 1, count: 3 });
    expect(a.safe.dealt).toHaveLength(3);
    expect(G.hostView(g).feed[0]).toMatchObject({ type: 'crack', who: 'A' });
  });

  test('the crack comes before the next play, is refused twice, and what the other safes held is never sent', () => {
    const g = heistGame();
    const a = G.join(g, 'A').player;
    G.start(g);
    crack(g, a);
    expect(G.currentPlay(g, a)).toEqual({ n: a.n, safe: { n: 1, count: 3 } });
    expect(() => G.answer(g, a, a.n, 'x')).toThrow(/safe/i);
    const pv = G.playerView(g, a);
    expect(pv.heist.safe).toEqual({ n: 1, count: 3 });
    expect(JSON.stringify(pv)).not.toMatch(/dealt|"units"|JACKPOT|Decoy/);
    const r = G.openSafe(g, a, 1);
    expect(r).toMatchObject({ idx: 1, n: 1 });
    expect(r.dealt).toBeUndefined();
    expect(() => G.openSafe(g, a, 0)).toThrow(/no safe/i);
    expect(() => G.openSafe(g, a, 7)).toThrow(); // and a bad pick on a fresh crack
    expect(G.currentPlay(g, a).play).toBeTruthy();
    expect(a.safes).toBe(1);
  });

  test('the three safes are dealt from the game seed: the same every time, for this player and crack', () => {
    const g = heistGame();
    const a = G.join(g, 'A').player; const b = G.join(g, 'B').player;
    const d1 = H.dealSafes(g, a, 1);
    expect(H.dealSafes(g, a, 1)).toEqual(d1);
    expect(d1.every((s) => H.OUTCOMES.some((o) => o.kind === s.kind))).toBe(true);
    // a different player or a different crack is a different deal (over a few games, at least once)
    const differs = [H.dealSafes(g, b, 1), H.dealSafes(g, a, 2), H.dealSafes({ ...g, seed: 'other' }, a, 1)].some((d) => JSON.stringify(d) !== JSON.stringify(d1));
    expect(differs).toBe(true);
  });

  test('the odds add to 100 and every outcome kind is reachable', () => {
    expect(H.OUTCOMES.reduce((s, o) => s + o.weight, 0)).toBe(100);
    const seen = new Set();
    const g = heistGame();
    const a = G.join(g, 'A').player;
    for (let n = 1; n < 400 && seen.size < 6; n++) for (const s of H.dealSafes(g, a, n)) seen.add(s.kind);
    expect([...seen].sort()).toEqual(['cash', 'decoy', 'gadget', 'grab', 'shakedown', 'switch']);
    // more than half the safes are a move on someone else (owner, 2026-11: "maybe a couple" in five minutes was too few)
    expect(H.OUTCOMES.filter((o) => H.ATTACKS.includes(o.kind)).reduce((t, o) => t + o.weight, 0)).toBeGreaterThanOrEqual(50);
  });

  /** Put a chosen outcome in safe 0 of an open crack (setup only — the deal itself is seeded). */
  function rig(p, outcome) { p.safe.dealt[0] = outcome; }
  function crackWith(g, p, outcome) { crack(g, p); rig(p, outcome); return G.openSafe(g, p, 0); }

  test('cash safes pay in units of a fast answer; the jackpot is six of them', () => {
    const g = heistGame();
    const a = G.join(g, 'A').player;
    G.start(g);
    const before = a.cash + 0;
    expect(crackWith(g, a, { kind: 'cash', units: 6, label: 'JACKPOT' })).toMatchObject({ kind: 'cash', amount: 6 * U, label: 'JACKPOT' });
    expect(a.cash).toBe(before + 3 * 150 + 6 * U);
    expect(G.hostView(g).feed[0]).toMatchObject({ type: 'jackpot', who: 'A', amount: 6 * U });
    expect(G.hostView(g).rules.heist).toMatchObject({ cashMin: U, cashMax: 3 * U, jackpot: 6 * U, alarmSec: 6, alarmCost: 50, safeEvery: 3, grabPct: 20 });
  });

  test('a decoy is empty: the streak was the price', () => {
    const g = heistGame();
    const a = G.join(g, 'A').player;
    G.start(g);
    const r = crackWith(g, a, { kind: 'decoy', label: 'Decoy' });
    expect(r).toMatchObject({ kind: 'decoy', amount: 0, cash: 450 });
  });
});

describe('grab and switch — your pick, only from the classmates above you', () => {
  /** Put a chosen outcome in safe 0 of an open crack (setup only — the deal itself is seeded). */
  function rig(p, outcome) { p.safe.dealt[0] = outcome; }
  function crackWith(g, p, outcome) { crack(g, p); rig(p, outcome); return G.openSafe(g, p, 0); }

  test('a grab offers every richer classmate, richest first, and takes 20% from the one picked', () => {
    const g = heistGame();
    const a = G.join(g, 'A').player; const b = G.join(g, 'B').player; const c = G.join(g, 'C').player; const d = G.join(g, 'D').player;
    G.start(g);
    a.cash = 1000; c.cash = 3000; d.cash = 10; b.cash = 100;
    const r = crackWith(g, b, { kind: 'grab', label: 'Grab' });
    expect(r.kind).toBe('grab');
    expect(r.choose.map((t) => [t.name, t.cash])).toEqual([['C', 3000], ['A', 1000]]); // D is below: not offered
    expect(b.pick).toMatchObject({ kind: 'grab' });
    // the choice comes before the next play, and the student's view carries it (a reconnect sees it)
    expect(G.currentPlay(g, b).pick.options.map((t) => t.name)).toEqual(['C', 'A']);
    expect(G.playerView(g, b).heist.pick.kind).toBe('grab');
    expect(() => G.answer(g, b, b.n, 'a')).toThrow(/target/);
    const got = G.pickTarget(g, b, c.id);
    expect(got).toMatchObject({ kind: 'grab', target: 'C', amount: 600 });
    expect(c.cash).toBe(2400);
    expect(b.cash).toBe(100 + 3 * U + 600);
    expect(b.pick).toBeNull();
    expect(c.lastHit).toMatchObject({ by: 'B', kind: 'grab', amount: 600 });
    expect(g.feed[0]).toMatchObject({ type: 'grab', who: 'B', target: 'C', amount: 600 });
    expect(G.currentPlay(g, b).play).toBeDefined();
  });

  test('a name below the opener is refused whatever the screen showed — nobody can rob down', () => {
    const g = heistGame();
    const a = G.join(g, 'A').player; const b = G.join(g, 'B').player; const d = G.join(g, 'D').player;
    G.start(g);
    a.cash = 1000; d.cash = 10; b.cash = 100;
    crackWith(g, b, { kind: 'grab', label: 'Grab' });
    expect(() => G.pickTarget(g, b, d.id)).toThrow(/ahead of you/);
    expect(() => G.pickTarget(g, b, b.id)).toThrow(/ahead of you/);
    expect(() => G.pickTarget(g, b, 'nobody')).toThrow(/ahead of you/);
    expect(d.cash).toBe(10);
    expect(b.pick).not.toBeNull(); // still waiting: the fresh list comes on the next fetch
    expect(G.currentPlay(g, b).pick.options.map((t) => t.name)).toEqual(['A']);
    expect(G.pickTarget(g, b, a.id).target).toBe('A');
  });

  test('a grab with nobody richer pays cash instead — the leader cannot rob down', () => {
    const g = heistGame();
    const a = G.join(g, 'A').player; const b = G.join(g, 'B').player;
    G.start(g);
    const r = crackWith(g, a, { kind: 'grab', label: 'Grab' });
    expect(r.kind).toBe('cash');
    expect(r.choose).toBeUndefined();
    expect(r.amount).toBe(2 * U);
    expect(b.cash).toBe(0);
    expect(a.pick).toBeNull();
  });

  test('if everyone offered drops below the opener before the pick, the safe pays cash', () => {
    const g = heistGame();
    const a = G.join(g, 'A').player; const b = G.join(g, 'B').player;
    G.start(g);
    a.cash = 1000; b.cash = 100;
    crackWith(g, b, { kind: 'grab', label: 'Grab' });
    a.cash = 0; // A got robbed by someone else meanwhile
    const r = G.pickTarget(g, b, a.id);
    expect(r.kind).toBe('cash');
    expect(r.amount).toBe(2 * U);
    expect(b.pick).toBeNull();
  });

  test('a switch swaps piles with the classmate picked — only ever up for the opener', () => {
    const g = heistGame();
    const a = G.join(g, 'A').player; const b = G.join(g, 'B').player;
    G.start(g);
    a.cash = 2000; b.cash = 100;
    const r = crackWith(g, b, { kind: 'switch', label: 'Switch' });
    expect(r.kind).toBe('switch');
    expect(r.choose.map((t) => t.name)).toEqual(['A']);
    const mine = b.cash;
    const got = G.pickTarget(g, b, a.id);
    expect(got).toMatchObject({ kind: 'switch', target: 'A', amount: 2000 - mine });
    expect(b.cash).toBe(2000);
    expect(a.cash).toBe(mine);
    expect(a.lastHit).toMatchObject({ by: 'B', kind: 'switch' });
    expect(g.feed[0]).toMatchObject({ type: 'switch', who: 'B', target: 'A' });
  });

  test('the picks are refused once the clock is out, and a pending pick lapses at the final', () => {
    const g = heistGame();
    const a = G.join(g, 'A').player; const b = G.join(g, 'B').player;
    G.start(g);
    a.cash = 1000; b.cash = 100;
    crackWith(g, b, { kind: 'grab', label: 'Grab' });
    jest.advanceTimersByTime(130000);
    expect(() => G.pickTarget(g, b, a.id)).toThrow(/clock/);
    expect(a.cash).toBe(1000);
  });
});

describe('gadgets', () => {
  function withGadget(g, p, kind) {
    crack(g, p);
    p.safe.dealt[0] = { kind: 'gadget', label: 'Gadget', gadget: kind };
    return G.openSafe(g, p, 0);
  }

  test('a gadget safe hands the finder a trick they fire when they like; it hits everyone else and expires', () => {
    const g = heistGame();
    const [a, b, c] = ['A', 'B', 'C'].map((n) => G.join(g, n).player);
    G.start(g);
    const r = withGadget(g, a, 'smoke');
    expect(r).toMatchObject({ kind: 'gadget', gadget: { kind: 'smoke', label: 'Smoke bomb' } });
    expect(G.playerView(g, a).heist.gadgets).toEqual([expect.objectContaining({ kind: 'smoke', id: r.gadget.id })]);
    expect(G.playerView(g, b).heist.effect).toBeNull();
    const fired = G.useGadget(g, a, r.gadget.id);
    expect(fired).toMatchObject({ kind: 'smoke', until: Date.now() + H.GADGET_MS });
    expect(G.playerView(g, a).heist.gadgets).toEqual([]);
    expect(G.playerView(g, a).heist.effect).toBeNull(); // the finder's own screen stays clear
    expect(G.playerView(g, b).heist.effect).toMatchObject({ kind: 'smoke', by: 'A', until: fired.until });
    expect(G.playerView(g, c).heist.effect).toMatchObject({ kind: 'smoke' });
    expect(G.hostView(g).heist.effects).toEqual([{ kind: 'smoke', by: 'A', until: fired.until }]);
    expect(G.hostView(g).feed[0]).toMatchObject({ type: 'gadget', who: 'A', kind: 'smoke' });
    expect(() => G.useGadget(g, a, r.gadget.id)).toThrow(/don't have/);
    jest.advanceTimersByTime(H.GADGET_MS + 100);
    expect(G.playerView(g, b).heist.effect).toBeNull();
    expect(G.hostView(g).heist.effects).toEqual([]);
  });

  test('the newest effect is the one a screen shows, and a full pocket pays cash instead of a fourth gadget', () => {
    const g = heistGame();
    const [a, b] = ['A', 'B'].map((n) => G.join(g, n).player);
    G.start(g);
    const s = withGadget(g, a, 'smoke');
    const f = withGadget(g, a, 'flip');
    G.useGadget(g, a, s.gadget.id);
    jest.advanceTimersByTime(1000);
    G.useGadget(g, a, f.gadget.id);
    expect(G.playerView(g, b).heist.effect.kind).toBe('flip');
    withGadget(g, a, 'smoke'); withGadget(g, a, 'smoke'); withGadget(g, a, 'smoke');
    expect(a.gadgets).toHaveLength(H.MAX_GADGETS);
    const r = withGadget(g, a, 'smoke');
    expect(r.kind).toBe('cash');
    expect(a.gadgets).toHaveLength(H.MAX_GADGETS);
  });

  test('gadgets and safes are refused once the clock is out', () => {
    const g = heistGame();
    const a = G.join(g, 'A').player;
    G.start(g);
    const r = withGadget(g, a, 'flip');
    crack(g, a);
    G.endGame(g);
    expect(() => G.openSafe(g, a, 0)).toThrow(/clock/);
    expect(() => G.useGadget(g, a, r.gadget.id)).toThrow(/clock/);
  });
});

describe('shakedown — your pick, a spoiler', () => {
  function crackWith(g, p, outcome) { crack(g, p); p.safe.dealt[0] = outcome; return G.openSafe(g, p, 0); }

  test('the classmate picked drops 30% and the opener pockets 10% — it hurts them more than it helps you', () => {
    const g = heistGame();
    const a = G.join(g, 'A').player; const b = G.join(g, 'B').player; const c = G.join(g, 'C').player; const d = G.join(g, 'D').player;
    G.start(g);
    a.cash = 1000; c.cash = 2000; d.cash = 50; b.cash = 100;
    const r = crackWith(g, b, { kind: 'shakedown', label: 'Shakedown' });
    expect(r.kind).toBe('shakedown');
    expect(r.choose.map((t) => t.name)).toEqual(['C', 'A']); // D is below: not offered
    expect(G.currentPlay(g, b).pick.kind).toBe('shakedown');
    expect(() => G.pickTarget(g, b, d.id)).toThrow(/ahead of you/);
    const got = G.pickTarget(g, b, c.id);
    expect(got).toMatchObject({ kind: 'shakedown', target: 'C', lost: 600, amount: 200 });
    expect([a.cash, c.cash, d.cash, b.cash]).toEqual([1000, 1400, 50, 100 + 3 * U + 200]); // only C pays; B: the crack, then the cut
    expect(c.lastHit).toMatchObject({ by: 'B', kind: 'shakedown', amount: 600 });
    expect(b.grabbed).toBe(200);
    expect(g.feed[0]).toMatchObject({ type: 'shakedown', who: 'B', target: 'C', amount: 600, gain: 200 });
    expect(b.pick).toBeNull();
    // nobody richer: cash instead
    expect(crackWith(g, c, { kind: 'shakedown', label: 'Shakedown' }).kind).toBe('cash');
  });

  test('nothing another player does ever takes a screen away: the alarm is the only lock', () => {
    expect(H.OUTCOMES.map((o) => o.kind)).not.toContain('jail');
    expect(H.GADGETS.map((x) => x.kind)).toEqual(['smoke', 'flip']);
  });
});

describe('views, final, snapshot', () => {
  test('standings by cash; the student sees rank, the leader and the gap above; the host sees the crew', () => {
    const g = heistGame();
    const [a, b, c] = ['A', 'B', 'C'].map((n) => G.join(g, n).player);
    G.start(g);
    go(g, a); go(g, a); // 300
    go(g, b); // 150
    const pv = G.playerView(g, b);
    expect(pv.heist).toMatchObject({ cash: 150, rank: 2, of: 3, leader: { name: 'A', cash: 300, me: false }, above: { name: 'A', gap: 150 }, toSafe: 2, safe: null, alarmUntil: null, gadgets: [], effect: null });
    expect(G.playerView(g, a).heist.leader.me).toBe(true);
    const hv = G.hostView(g).heist;
    expect(hv.crew.map((p) => [p.name, p.cash, p.rank])).toEqual([['A', 300, 1], ['B', 150, 2], ['C', 0, 3]]);
    expect(hv.top).toBe(300);
    expect(c.cash).toBe(0);
  });

  test('the final ranks by cash with the awards, on both screens', () => {
    const g = heistGame();
    const [a, b] = ['A', 'B'].map((n) => G.join(g, n).player);
    G.start(g);
    crack(g, a); a.safe.dealt[0] = { kind: 'cash', units: 6, label: 'JACKPOT' }; G.openSafe(g, a, 0);
    go(g, b); go(g, b, false);
    G.endGame(g);
    const f = G.hostView(g).final;
    expect(f.heist.standings.map((s) => [s.place, s.name, s.cash])).toEqual([[1, 'A', 450 + 6 * U], [2, 'B', 100]]);
    expect(f.heist.standings[1]).toMatchObject({ alarms: 1, comp: 1, att: 2 });
    expect(f.heist.safecracker).toEqual({ name: 'A', count: 1 });
    expect(f.heist.biggestGrab).toBeNull();
    expect(f.heist.safesCracked).toBe(1);
    expect(G.playerView(g, b).heist).toMatchObject({ rank: 2, of: 2 });
  });

  test('a snapshot carries the heist: cash, an open crack, a held gadget, a live effect', () => {
    const g = heistGame();
    const [a, b] = ['A', 'B'].map((n) => G.join(g, n).player);
    G.start(g);
    crack(g, a); a.safe.dealt[0] = { kind: 'gadget', label: 'Gadget', gadget: 'smoke' };
    const r = G.openSafe(g, a, 0);
    G.useGadget(g, a, r.gadget.id);
    crack(g, b);
    const snap = JSON.parse(JSON.stringify(G.snapshot(g)));
    G._reset();
    const h = G.hydrate(snap);
    expect(h.mode).toBe('heist');
    const hb = h.players.get(b.id);
    expect(hb.safe.dealt).toEqual(b.safe.dealt);
    expect(h.players.get(a.id).cash).toBe(450);
    expect(G.playerView(h, hb).heist.effect).toMatchObject({ kind: 'smoke', by: 'A' });
    expect(G.openSafe(h, hb, 2).n).toBe(1);
  });

  test('run it back clears the vault', () => {
    const g = heistGame();
    const a = G.join(g, 'A').player;
    G.start(g);
    crack(g, a);
    G.endGame(g);
    G.rematch(g);
    expect(a).toMatchObject({ cash: 0, safe: null, safes: 0, gadgets: [], lockUntil: 0 });
    expect(g.heist).toEqual({ effects: [], safesCracked: 0 });
  });

  test('the lobby rules come from the constants', () => {
    const r = G.hostView(heistGame()).rules;
    expect(r.heist).toMatchObject({ pay: [150, 100, 50], alarmCost: 50, alarmSec: 6, safeEvery: 3, safeCount: 3, grabPct: 20, shakeLoss: 30, shakeTake: 10, gadgetSec: 6 });
    expect(r.heist.gadgets.map((x) => x.kind)).toEqual(['smoke', 'flip']);
    expect(r.heist.attackPct).toBeGreaterThanOrEqual(50);
    expect(Object.values(r.heist.odds).reduce((s, x) => s + x, 0)).toBe(100);
    expect(r.blitz).toBeNull();
    expect(r.hill).toBeNull();
  });
});

/**
 * The balance check. Two bots on the standard drill for two minutes:
 *   thinker — right 85% of the time, 5 s a play (a student who reads the problem);
 *   guesser — right 25% of the time (one of four), 1.2 s a tap.
 * The alarm, the streak-gated safe and the cash cost together must make guessing a losing
 * strategy: the thinker wins at least 80% of 200 games. (With no alarm and no cost, a guesser
 * who taps four times as fast opens as many safes as a thinker — the Gold Quest problem.)
 */
describe('simulator: thinking beats guessing', () => {
  /**
   * Event-driven: every bot has a "next act" time; the scheduler advances the fake clock to the
   * earliest one and lets that bot act, so a fast guesser really does take four taps while a
   * thinker takes one, and grabs or switches can land either way. Shared by the stats run in
   * scripts/simLiveDrillHeist.js.
   */
  function simulate(bots, seed, seconds = 120) {
    let x = seed;
    const rnd = () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; };
    const g = heistGame({ seconds });
    const attacks = { gadget: 0 }; // every move on another player, counted as it lands
    g._onFeed = (item) => { if (['grab', 'switch', 'shakedown'].includes(item.type)) attacks[item.type] = (attacks[item.type] || 0) + 1; };
    const ps = bots.map((b) => ({ ...b, p: G.join(g, b.name).player, nextAt: 0 }));
    G.start(g);
    const end = g.endsAt;
    for (const b of ps) b.nextAt = Date.now() + b.ms * (0.8 + 0.4 * rnd());
    for (;;) {
      const b = ps.reduce((m, c) => (c.nextAt < m.nextAt ? c : m));
      if (b.nextAt >= end) break;
      jest.advanceTimersByTime(Math.max(0, b.nextAt - Date.now()));
      if (b.pending) { // the think is over: answer the play dealt earlier
        const pl = G.playAt(g, b.pending);
        G.answer(g, b.p, b.pending, rnd() < b.acc ? pl.answer : wrongKey(pl));
        b.pending = null;
        b.nextAt = Date.now() + 300; // a glance at the result
        continue;
      }
      // a held gadget is fired, usually, before the next play
      if (b.p.gadgets.length && rnd() < 0.7) { G.useGadget(g, b.p, b.p.gadgets[0].id); attacks.gadget++; }
      const cur = G.currentPlay(g, b.p);
      if (cur.alarm) { b.nextAt = cur.alarm + 10; continue; }
      if (cur.safe) { G.openSafe(g, b.p, Math.floor(rnd() * cur.safe.count)); b.nextAt = Date.now() + 800; continue; }
      if (cur.pick) { // a grab or a switch: this bot goes for the richest classmate offered, after a look
        const top = cur.pick.options[0]; // (nobody left above → the server pays cash whatever id is sent)
        G.pickTarget(g, b.p, top ? top.id : 'none'); b.nextAt = Date.now() + 800; continue;
      }
      b.pending = cur.n; // dealt now; the bot thinks for its time, then answers
      b.nextAt = Date.now() + b.ms * (0.8 + 0.4 * rnd());
    }
    jest.advanceTimersByTime(end - Date.now() + 2000);
    const out = ps.map((b) => ({ name: b.name, cash: b.p.cash, safes: b.p.safes, att: b.p.att, comp: b.p.comp }));
    out.attacks = attacks;
    return out;
  }

  test('a thinker (85%, 5 s) beats a guesser (25%, 1.2 s) at least 4 games in 5', () => {
    let wins = 0; let tSafes = 0; let qSafes = 0; const N = 200;
    for (let i = 0; i < N; i++) {
      const [t, q] = simulate([{ name: 'Thinker', acc: 0.85, ms: 5000 }, { name: 'Guesser', acc: 0.25, ms: 1200 }], 1000 + i);
      if (t.cash > q.cash) wins++;
      tSafes += t.safes; qSafes += q.safes;
      expect(t.att).toBeGreaterThan(10); // the scheduler really plays both bots
      G._reset();
    }
    expect(wins / N).toBeGreaterThanOrEqual(0.8);
    expect(tSafes).toBeGreaterThan(qSafes); // the safes go to the one who answers
  });

  test('a half-guesser (50%, 3 s) loses to a thinker too — the alarm is worth more than speed', () => {
    let wins = 0; const N = 100;
    for (let i = 0; i < N; i++) {
      const [t, h] = simulate([{ name: 'Thinker', acc: 0.85, ms: 5000 }, { name: 'Half', acc: 0.5, ms: 3000 }], 5000 + i);
      if (t.cash > h.cash) wins++;
      G._reset();
    }
    expect(wins / N).toBeGreaterThanOrEqual(0.7);
  });

  test('stats (printed once for tuning): four profiles over 100 games', () => {
    const bots = [{ name: 'thinker', acc: 0.85, ms: 5000 }, { name: 'guesser', acc: 0.25, ms: 1200 }, { name: 'half', acc: 0.5, ms: 3000 }, { name: 'fastgood', acc: 0.9, ms: 3000 }];
    const tot = {}; const wins = {}; const N = 100;
    for (let i = 0; i < N; i++) {
      const r = simulate(bots, 50 + i);
      const top = [...r].sort((a, b) => b.cash - a.cash)[0].name;
      wins[top] = (wins[top] || 0) + 1;
      for (const p of r) { tot[p.name] = tot[p.name] || { cash: 0, safes: 0, att: 0 }; tot[p.name].cash += p.cash; tot[p.name].safes += p.safes; tot[p.name].att += p.att; }
      G._reset();
    }
    const avg = Object.fromEntries(Object.entries(tot).map(([k, v]) => [k, { cash: Math.round(v.cash / N), safes: +(v.safes / N).toFixed(1), att: +(v.att / N).toFixed(1) }]));
    if (process.env.HEIST_SIM_STATS) process.stdout.write(`heist sim ${JSON.stringify({ wins, avg })}\n`);
    expect((wins.guesser || 0) / N).toBeLessThan(0.05); // a blind guesser almost never takes a four-way game
    expect(avg.fastgood.cash).toBeGreaterThan(avg.thinker.cash); // fast AND right still pays most
  });

  test('a five-minute class game is full of attacks: a crew of six lands one every 20 s or better', () => {
    // The owner's report (2026-11): a five-minute game with "maybe a couple" of grabs. Six
    // ordinary students (not guessers) for 300 s must now produce at least 15 moves on each
    // other — grabs, switches, shakedowns, gadgets fired — one every 20 s (the sim lands
    // about 20; the old 21% attack share gave about 7).
    const bots = [{ name: 'A', acc: 0.85, ms: 5000 }, { name: 'B', acc: 0.75, ms: 6000 }, { name: 'C', acc: 0.9, ms: 4000 },
      { name: 'D', acc: 0.7, ms: 7000 }, { name: 'E', acc: 0.8, ms: 5500 }, { name: 'F', acc: 0.65, ms: 8000 }];
    let total = 0; const kinds = {}; const N = 20;
    for (let i = 0; i < N; i++) {
      const r = simulate(bots, 9000 + i, 300);
      const n = Object.values(r.attacks).reduce((t, x) => t + x, 0);
      total += n;
      for (const [k, v] of Object.entries(r.attacks)) kinds[k] = (kinds[k] || 0) + v;
      G._reset();
    }
    if (process.env.HEIST_SIM_STATS) process.stdout.write(`heist attacks/game ${(total / N).toFixed(1)} ${JSON.stringify(kinds)}\n`);
    expect(total / N).toBeGreaterThanOrEqual(15);
    for (const k of ['grab', 'switch', 'shakedown', 'gadget']) expect(kinds[k] || 0).toBeGreaterThan(0); // every kind lands
  });
});
