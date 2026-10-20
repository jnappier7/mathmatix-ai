/**
 * Live Two-Minute Drill — King of the Hill (utils/liveDrill/hill.js through games.js).
 *
 * What these pin — the fairness rules first, because they are why the mode is safe to run:
 *   - a boulder only ever lands on the climber DIRECTLY ABOVE the thrower: never below, never a
 *     student of the thrower's choosing;
 *   - a climber who was just knocked down is steady for a few seconds: the next boulder skips them;
 *   - the king's third in a row raises a shield, and a shield stops one boulder;
 *   - right answers climb by the drill's speed tiers, wrong ones slip; the summit caps the climb;
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
    expect(go(g, a, true, 1000).hill.h).toBe(6);
    expect(go(g, a, true, 4000).hill.h).toBe(10);
    expect(go(g, a, false).hill.h).toBe(8);
    at(a, 98);
    expect(go(g, a, true).hill.h).toBe(H.SUMMIT);
    expect(g.teams.every((t) => t.pts === 0 && t.pos === G.START_POS)).toBe(true); // no football here
  });

  test('a slip never goes below the base', () => {
    const g = hillGame();
    const a = G.join(g, 'A').player;
    G.start(g);
    expect(go(g, a, false).hill.h).toBe(0);
  });
});

describe('boulders (the fairness rules)', () => {
  test('every third in a row hits the climber directly above — not the king, not anyone below', () => {
    const g = hillGame();
    const [k, mid, me, low] = ['King', 'Mid', 'Me', 'Low'].map((n) => G.join(g, n).player);
    G.start(g);
    at(k, 80); at(mid, 50); at(me, 20); at(low, 5);
    go(g, me); go(g, me);
    expect(mid.h).toBe(50); // two in a row: nothing yet
    const r = go(g, me);
    expect(r.hill.threw).toEqual({ name: 'Mid', blocked: false });
    expect(mid.h).toBe(50 - H.KNOCK);
    expect(k.h).toBe(80);
    expect(low.h).toBe(5);
    expect(g.feed[0]).toMatchObject({ type: 'knock', who: 'Me', target: 'Mid' });
  });

  test('"directly above" is measured after the climb that earned it', () => {
    const g = hillGame();
    const [a, b, me] = ['A', 'B', 'Me'].map((n) => G.join(g, n).player);
    G.start(g);
    at(a, 40); at(b, 16); at(me, 0);
    go(g, me); go(g, me); // me at 12
    go(g, me); // climbs to 18, now above B — so the boulder goes to A
    expect(b.h).toBe(16);
    expect(a.h).toBe(40 - H.KNOCK);
  });

  test('a climber who was just knocked is steady: the next boulder skips to the next one up', () => {
    const g = hillGame();
    const [top, mid, me] = ['Top', 'Mid', 'Me'].map((n) => G.join(g, n).player);
    G.start(g);
    at(top, 90); at(mid, 60); at(me, 10);
    mid.steadyUntil = Date.now() + 60000;
    go(g, me); go(g, me); go(g, me);
    expect(mid.h).toBe(60);
    expect(top.h).toBe(90 - H.KNOCK);
  });

  test('steady wears off after a few seconds', () => {
    const g = hillGame();
    const [mid, me] = ['Mid', 'Me'].map((n) => G.join(g, n).player);
    G.start(g);
    at(mid, 60); at(me, 10);
    mid.steadyUntil = Date.now() + H.STEADY_MS;
    jest.advanceTimersByTime(H.STEADY_MS);
    go(g, me); go(g, me); go(g, me);
    expect(mid.h).toBe(60 - H.KNOCK);
  });

  test('the king\'s third in a row raises a shield, and the shield stops one boulder', () => {
    const g = hillGame();
    const [k, me] = ['King', 'Me'].map((n) => G.join(g, n).player);
    G.start(g);
    at(k, 70); at(me, 10);
    go(g, k); go(g, k);
    expect(go(g, k).hill.shield).toBe(true);
    expect(k.shield).toBe(true);
    const r = (go(g, me), go(g, me), go(g, me));
    expect(r.hill.threw).toEqual({ name: 'King', blocked: true });
    expect(k.shield).toBe(false);
    expect(k.h).toBe(88); // untouched
    go(g, me); go(g, me); go(g, me); // the next one lands
    expect(k.h).toBe(88 - H.KNOCK);
  });

  test('a knockdown never takes anyone below the base', () => {
    const g = hillGame();
    const [mid, me] = ['Mid', 'Me'].map((n) => G.join(g, n).player);
    G.start(g);
    at(mid, 20); at(me, 0);
    go(g, me); go(g, me); go(g, me); // me 18, mid 20 → 5
    expect(mid.h).toBe(5);
    expect(mid.steadyUntil).toBeGreaterThan(Date.now()); // and now steady
    mid.steadyUntil = 0; at(mid, 30); at(me, 0); me.streak = 0;
    go(g, me); go(g, me); go(g, me);
    expect(mid.h).toBe(15);
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
    expect(v).toMatchObject({ rank: 2, of: 2, h: 6, above: { name: 'A', gap: 44 }, toBoulder: 2, shield: false });
    expect(G.playerView(g, a).hill.king).toMatchObject({ name: 'A', me: true });
  });

  test('the lobby rules describe the hill', () => {
    const g = hillGame();
    expect(G.hostView(g).rules.hill).toEqual({ summit: 100, knock: H.KNOCK, boulderEvery: 3, steadySec: H.STEADY_MS / 1000 });
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
