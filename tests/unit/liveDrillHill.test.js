/**
 * Live Two-Minute Drill — King of the Hill (utils/liveDrill/hill.js through games.js).
 *
 * What these pin — the fairness rules first, because they are why the mode is safe to run:
 *   - a boulder is the thrower's pick (owner, 2026-11-18) but only from BELOW: the choice is the
 *     climbers above them within reach, the server refuses a name below, and "none" keeps climbing;
 *   - a climber who was just knocked down is steady for a few seconds: nobody can be offered them;
 *   - anyone's fifth in a row raises a shield, and a shield stops one boulder;
 *   - a knock is priced in the drill's own tiers (half a fast answer plus a tenth of the height);
 *   - the crab-pot simulation: a class that always throws at the leader still has a race;
 *   - right answers climb by the drill's speed tiers (half that for the king — the crown is heavy),
 *     wrong ones slip; the summit caps the climb; a boulder takes more the higher you are;
 *   - the crown follows the highest climber, the reign clock adds up, the final ranks by height.
 */
jest.useFakeTimers();
const G = require('../../utils/liveDrill/games');
const H = require('../../utils/liveDrill/hill');

afterEach(() => G._reset());

let hostN = 0;
function hillGame(opts = {}) {
  return G.createGame({ hostId: `h${++hostN}`, drill: 'facts', playbook: 'mul', mode: 'hill', ...opts });
}
/** Answer `p`'s current play: right (fast) or wrong. */
function go(g, p, ok = true, ms = 1000) {
  const { n } = G.currentPlay(g, p);
  jest.advanceTimersByTime(ms);
  const pl = G.playAt(g, n);
  return G.answer(g, p, n, ok ? pl.answer : String(Number(pl.answer) + 1));
}
/** Put a climber at a height directly (setup only). */
const at = (p, h) => { p.h = h; p.hAt = Date.now() - h; };

describe('climbing', () => {
  test('right answers climb by the facts tiers, wrong ones slip, and the summit caps it', () => {
    const g = hillGame();
    const a = G.join(g, 'A').player;
    G.start(g);
    expect(go(g, a, true, 1000).hill.h).toBe(6); // now the king (alone on the hill)…
    expect(go(g, a, true, 4000).hill.h).toBe(8); // …so +4 climbs +2
    expect(go(g, a, false).hill.h).toBe(6); // a slip is a full slip
    at(a, 98);
    expect(go(g, a, true).hill.h).toBe(H.SUMMIT);
    expect(g.teams.every((t) => t.pts === 0 && t.pos === G.START_POS)).toBe(true); // no football here
  });

  test('the crown is heavy: the king climbs at half speed, a challenger at full', () => {
    const g = hillGame();
    const [k, c] = ['King', 'Chaser'].map((n) => G.join(g, n).player);
    G.start(g);
    at(k, 50); go(g, k); // crowned at 56 (climbed before the crown)
    expect(go(g, k).hill.step).toBe(3);
    expect(go(g, c).hill.step).toBe(6);
    expect(G.hostView(g).rules.hill.kingStepPct).toBe(50);
  });

  test('a slip never goes below the base', () => {
    const g = hillGame();
    const a = G.join(g, 'A').player;
    G.start(g);
    expect(go(g, a, false).hill.h).toBe(0);
  });
});

describe('boulders (the fairness rules)', () => {
  const sc = G.SCORING.facts;

  test('every third in a row offers a boulder to roll at a climber ABOVE you, within reach — nearest first, never below, never out of reach', () => {
    const g = hillGame();
    const [far, top, mid, me, low] = ['Far', 'Top', 'Mid', 'Me', 'Low'].map((n) => G.join(g, n).player);
    G.start(g);
    at(far, 80); at(top, 40); at(mid, 30); at(me, 20); at(low, 5);
    go(g, me); go(g, me);
    expect(G.playerView(g, me).hill.pick).toBeNull(); // two in a row: nothing yet
    const r = go(g, me); // me at 38
    expect(r.hill.pick.kind).toBe('boulder');
    expect(r.hill.pick.options.map((o) => o.name)).toEqual(['Top', 'Far'].slice(0, 1)); // Mid is now below; Far (80) is out of reach
    expect(r.hill.pick.options[0]).toMatchObject({ id: top.id, h: 40, gap: 2, king: false, shield: false });
    expect(mid.h).toBe(30); expect(top.h).toBe(40); expect(low.h).toBe(5); // nothing lands until the pick
    // the phone sees the same choice before the next play, and cannot answer around it
    expect(G.currentPlay(g, me).pick.options.map((o) => o.id)).toEqual([top.id]);
    expect(() => G.answer(g, me, me.n, 'a')).toThrow(/Roll your boulder first/);
  });

  test('the pick lands: a knock priced in the drill\'s tiers; a name below, out of the offer, or steady is refused; "none" keeps climbing', () => {
    const g = hillGame();
    const [top, mid, me, low] = ['Top', 'Mid', 'Me', 'Low'].map((n) => G.join(g, n).player);
    G.start(g);
    at(top, 50); at(mid, 40); at(me, 10); at(low, 2);
    go(g, me); go(g, me); const r = go(g, me); // me at 28: Mid (40) and Top (50) in reach
    expect(r.hill.pick.options.map((o) => o.name)).toEqual(['Mid', 'Top']);
    expect(() => G.pickTarget(g, me, low.id)).toThrow(/above you/); // never down
    expect(() => G.pickTarget(g, me, me.id)).toThrow(/above you/);
    mid.steadyUntil = Date.now() + 1000;
    expect(() => G.pickTarget(g, me, mid.id)).toThrow(/steady/); // no piling on
    const hit = G.pickTarget(g, me, top.id);
    expect(hit).toMatchObject({ kind: 'boulder', name: 'Top', blocked: false, fall: 8 }); // 0.5 × 6 + 0.1 × 50
    expect(top.h).toBeCloseTo(42);
    expect(top.steadyUntil).toBe(Date.now() + H.STEADY_MS);
    expect(me.thrown).toBe(1); expect(top.taken).toBe(1);
    expect(g.feed[0]).toMatchObject({ type: 'knock', who: 'Me', target: 'Top' });
    expect(me.boulder).toBeNull();
    expect(() => G.pickTarget(g, me, top.id)).toThrow(/No boulder/);
    expect(G.currentPlay(g, me).play).toBeTruthy(); // play on
    // the next boulder: keep climbing instead (Top is steady, Mid has climbed on ahead)
    at(mid, 60);
    go(g, me); go(g, me); const r2 = go(g, me); // me at 46
    expect(r2.hill.pick.options.map((o) => o.name)).toEqual(['Mid']);
    expect(G.pickTarget(g, me, 'none')).toEqual({ kind: 'boulder', skipped: true });
    expect(top.h).toBeCloseTo(42); expect(mid.h).toBe(60);
  });

  test('a boulder offered to climbers who have all moved out of reach or gone steady is dropped at the next fetch', () => {
    const g = hillGame();
    const [top, me] = ['Top', 'Me'].map((n) => G.join(g, n).player);
    G.start(g);
    at(top, 30); at(me, 10);
    go(g, me); go(g, me); go(g, me);
    expect(me.boulder).toBeTruthy();
    top.steadyUntil = Date.now() + 5000;
    expect(G.currentPlay(g, me).play).toBeTruthy();
    expect(me.boulder).toBeNull();
  });

  test('"above" and "in reach" are measured after the climb that earned it', () => {
    const g = hillGame();
    const [a, b, me] = ['A', 'B', 'Me'].map((n) => G.join(g, n).player);
    G.start(g);
    at(a, 40); at(b, 16); at(me, 0);
    go(g, me); go(g, me); // me at 12: B is above, A out of reach (40)
    const r = go(g, me); // climbs to 18 — now above B, and A (22 above) is in reach
    expect(r.hill.pick.options.map((o) => o.name)).toEqual(['A']);
  });

  test('a tie is not "above": nobody is offered from the same height (or from the base)', () => {
    const g = hillGame();
    const [other, me] = ['Other', 'Me'].map((n) => G.join(g, n).player);
    G.start(g);
    at(other, 18); // got there first, so ranks ahead of a tie
    go(g, me); go(g, me);
    const r = go(g, me); // me at 18, level with Other
    expect(r.hill.pick).toBeNull();
    expect(me.boulder).toBeNull();
    expect(other.taken).toBe(0);
  });

  test('the king throws nothing (nobody above), and a boulder takes more the higher you are — in the drill\'s own tiers', () => {
    expect(H.knockAt(0, sc)).toBeCloseTo(3);
    expect(H.knockAt(50, sc)).toBeCloseTo(8);
    expect(H.knockAt(100, sc)).toBeCloseTo(13);
    expect(H.knockAt(0, G.SCORING.standard)).toBeCloseTo(7.5);
    expect(H.knockAt(100, G.SCORING.standard)).toBeCloseTo(17.5);
    const g = hillGame();
    const [k, me] = ['King', 'Me'].map((n) => G.join(g, n).player);
    G.start(g);
    at(k, 60); at(me, 10);
    go(g, k); go(g, k); const r = go(g, k);
    expect(r.hill.pick).toBeNull(); expect(k.boulder).toBeNull();
  });

  test('a climber who was just knocked is steady: not offered to anyone until it wears off', () => {
    const g = hillGame();
    const [top, mid, me] = ['Top', 'Mid', 'Me'].map((n) => G.join(g, n).player);
    G.start(g);
    at(top, 55); at(mid, 50); at(me, 10);
    mid.steadyUntil = Date.now() + H.STEADY_MS;
    go(g, me); go(g, me); const r = go(g, me); // me at 28: Mid is steady, Top (27 above) is in reach
    expect(r.hill.pick.options.map((o) => o.name)).toEqual(['Top']);
    G.pickTarget(g, me, 'none');
    jest.advanceTimersByTime(H.STEADY_MS);
    go(g, me); go(g, me); const r2 = go(g, me); // me at 46
    expect(r2.hill.pick.options.map((o) => o.name)).toEqual(['Mid', 'Top']);
  });

  test('anyone\'s fifth in a row raises a shield (one at a time), and a shield stops one boulder', () => {
    const g = hillGame();
    const [k, me] = ['King', 'Me'].map((n) => G.join(g, n).player);
    G.start(g);
    at(k, 20); at(me, 10);
    const raised = Array.from({ length: 10 }, () => go(g, k).hill.shield);
    expect(raised).toEqual([false, false, false, false, true, false, false, false, false, false]); // held, so the 10th raises nothing
    expect(k.shield).toBe(true);
    expect(g.feed.some((f) => f.type === 'shield' && f.who === 'King')).toBe(true);
    at(k, 30); // back in reach
    const before = k.h;
    go(g, me); go(g, me); const r = go(g, me);
    expect(r.hill.pick.options[0]).toMatchObject({ name: 'King', shield: true, king: true });
    expect(G.pickTarget(g, me, k.id)).toMatchObject({ kind: 'boulder', name: 'King', blocked: true, fall: 0 });
    expect(k.shield).toBe(false);
    expect(k.h).toBe(before); // untouched
    expect(g.feed[0]).toMatchObject({ type: 'blocked', who: 'Me', target: 'King' });
    at(k, 60); // climbed on; me at 28 → 46, King 14 above
    go(g, me); go(g, me); go(g, me); // the next one lands
    G.pickTarget(g, me, k.id);
    expect(k.h).toBeCloseTo(60 - H.knockAt(60, sc));
    // the climber below earns one too — a shield is not the king's alone
    expect(me.shield).toBe(true); // raised on their fifth, between the two boulders
    expect(G.playerView(g, me).hill.toShield).toBe(0);
  });

  test('a knockdown never takes anyone below the base', () => {
    const g = hillGame();
    const [mid, me] = ['Mid', 'Me'].map((n) => G.join(g, n).player);
    G.start(g);
    at(mid, 8); at(me, 0);
    go(g, me, true, 9000); go(g, me, true, 9000); const r = go(g, me, true, 9000); // slow +2s: me 6, Mid at 8 is 2 above
    expect(r.hill.pick.options.map((o) => o.name)).toEqual(['Mid']);
    at(me, 1); at(mid, 3); // both slid in the meantime: a 3.3 knock would go below
    G.pickTarget(g, me, mid.id);
    expect(mid.h).toBe(0);
    expect(mid.steadyUntil).toBeGreaterThan(Date.now()); // and now steady
  });
});

describe('crabs in a pot', () => {
  /**
   * The worst case for a chosen target: a class that ALWAYS throws at the highest climber in reach
   * (the king whenever it can). Twelve bots at their own accuracy and pace play 150 s of Math Facts.
   * What must hold: the best student still wins about as often as when nobody throws (so ganging
   * up on the leader doesn't pay), somebody reaches the summit (the class cannot keep everyone
   * pinned at the base), and the king's reign is a contest, not a lock. (At 180 s of Math Facts
   * everyone eventually summits, boulders or not — the hill is 100 tall and a fast answer is +6.)
   */
  function bot(name, acc, ms) { return { name, acc, ms }; }
  const CLASS = [bot('Ace', 0.95, 2200), bot('Bo', 0.9, 2600), bot('Cy', 0.85, 3000), bot('Di', 0.8, 3300), bot('Ed', 0.8, 3800), bot('Fi', 0.75, 4000),
    bot('Gil', 0.7, 4200), bot('Hu', 0.65, 4500), bot('Ivo', 0.6, 5000), bot('Jo', 0.55, 5200), bot('Kai', 0.5, 6000), bot('Lu', 0.4, 6500)];
  const rng = (seed) => { let x = seed >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; };

  function simulate(seed, strategy = 'crab', seconds = 180) {
    const rnd = rng(seed);
    const g = hillGame({ seconds });
    const bots = CLASS.map((b) => ({ ...b, p: G.join(g, b.name).player, due: 0 }));
    G.start(g);
    const t0 = Date.now(); let knocks = 0;
    for (let t = 0; t < seconds * 1000; t += 100) {
      jest.advanceTimersByTime(100);
      for (const b of bots) {
        if (t < b.due) continue;
        b.due = t + b.ms * (0.7 + 0.6 * rnd());
        const cur = G.currentPlay(g, b.p);
        if (cur.pick) { // the crab: always the highest climber in reach ('none': never throws)
          const top = cur.pick.options[cur.pick.options.length - 1];
          G.pickTarget(g, b.p, strategy === 'crab' ? top.id : 'none'); if (strategy === 'crab') knocks++;
          continue;
        }
        const pl = G.playAt(g, cur.n);
        G.answer(g, b.p, cur.n, rnd() < b.acc ? pl.answer : String(Number(pl.answer) + 1));
      }
    }
    G.endGame(g);
    const f = G.hostView(g).final.hill;
    return { winner: f.standings[0].name, top: f.standings[0].h, peak: Math.max(...f.standings.map((s) => s.peak)), reign: f.longestReign ? f.longestReign.sec : 0, knocks, elapsed: Date.now() - t0 };
  }

  test('a class that always throws at the leader still has a race: ganging up doesn\'t pay, the summit is reached, the crown changes hands', () => {
    const runs = Array.from({ length: 40 }, (_, i) => simulate(1000 + i * 7));
    const quiet = Array.from({ length: 40 }, (_, i) => simulate(1000 + i * 7, 'none'));
    const aceWins = runs.filter((r) => r.winner === 'Ace').length / runs.length;
    const aceQuiet = quiet.filter((r) => r.winner === 'Ace').length / quiet.length;
    const summits = runs.filter((r) => r.peak >= 90).length / runs.length;
    const avgReign = runs.reduce((a, r) => a + r.reign, 0) / runs.length;
    const avgKnocks = runs.reduce((a, r) => a + r.knocks, 0) / runs.length;
    console.log(`crab sim: Ace wins ${Math.round(aceWins * 100)}% (${Math.round(aceQuiet * 100)}% when nobody throws) · summit reached ${Math.round(summits * 100)}% · longest reign avg ${avgReign.toFixed(0)} s of ${180} · ${avgKnocks.toFixed(0)} boulders a game`);
    expect(aceWins).toBeGreaterThanOrEqual(0.35);
    expect(aceWins).toBeGreaterThanOrEqual(aceQuiet - 0.2);
    expect(summits).toBeGreaterThanOrEqual(0.8);
    expect(avgReign).toBeLessThan(130);
    expect(avgReign).toBeGreaterThan(20);
  });
});

describe('the crown and the final', () => {
  test('the crown follows the highest climber and the reign clock adds up', () => {
    const g = hillGame({ seconds: 60 });
    const [a, b] = ['A', 'B'].map((n) => G.join(g, n).player);
    G.start(g);
    go(g, a); // A crowned
    expect(g.feed[0]).toMatchObject({ type: 'crown', who: 'A' });
    jest.advanceTimersByTime(5000);
    go(g, b, true, 1000); go(g, b, true, 1000); // B passes A
    expect(G.hostView(g).hill.climbers[0]).toMatchObject({ name: 'B', king: true });
    G.endGame(g);
    const f = G.hostView(g).final.hill;
    expect(f.standings.map((s) => s.name)).toEqual(['B', 'A']);
    expect(f.longestReign.name).toBe('A');
    expect(f.longestReign.sec).toBeGreaterThan(5);
  });

  test('each phone sees its rank, who is just above, and how far to the next boulder', () => {
    const g = hillGame();
    const [a, b] = ['A', 'B'].map((n) => G.join(g, n).player);
    G.start(g);
    at(a, 50);
    go(g, b);
    const v = G.playerView(g, b).hill;
    expect(v).toMatchObject({ rank: 2, of: 2, h: 6, above: { name: 'A', gap: 44 }, toBoulder: 2, toShield: 4, shield: false, pick: null });
    expect(G.playerView(g, a).hill.king).toMatchObject({ name: 'A', me: true });
  });

  test('the lobby rules describe the hill', () => {
    const g = hillGame();
    expect(G.hostView(g).rules.hill).toEqual({ summit: 100, knockMin: 3, knockMax: 13, boulderEvery: 3, shieldEvery: 5, reach: 30,
      steadySec: H.STEADY_MS / 1000, kingStepPct: 50 });
    expect(G.hostView(G.createGame({ hostId: 'std', drill: 'algebra', playbook: 'all', mode: 'hill' })).rules.hill).toMatchObject({ knockMin: 7.5, knockMax: 17.5 });
    expect(G.hostView(g).rules).toMatchObject({ sack: 2, speed: [{ gain: 6 }, { gain: 4 }, { gain: 2 }] });
  });

  test('run it back puts everyone back at the base', () => {
    const g = hillGame();
    const a = G.join(g, 'A').player;
    G.start(g); go(g, a); G.endGame(g);
    G.rematch(g);
    expect(a.h).toBe(0);
    expect(g.hill.king).toBeNull();
  });

  test('works with the course drills too (multiple choice)', () => {
    const g = G.createGame({ hostId: 'alg', drill: 'algebra', playbook: 'all', mode: 'hill' });
    const a = G.join(g, 'A').player;
    G.start(g);
    expect(go(g, a, true, 1000).hill.h).toBe(15);
  });
});
