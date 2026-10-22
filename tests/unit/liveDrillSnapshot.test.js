/**
 * A live game survives the process that holds it (utils/liveDrill/games.js snapshot / hydrate).
 *
 * Render swaps the process on every deploy, and on 2026-10-22 two class games died mid-play that
 * way: the phones and the board reconnected to a server with no such code. A snapshot is the game
 * as JSON (Maps folded, timers and streams left out); hydrate brings it back in another process
 * with the same code, the same seats and tokens, the same deal, and a clock that ends when it was
 * always going to end.
 */
jest.useFakeTimers();
const G = require('../../utils/liveDrill/games');

const HOST = 'teacher-1';
afterEach(() => G._reset());

// The answer to the play a student is on (the phone's copy of a play never carries it).
const keyOf = (g, n) => G.playAt(g, n).answer;

// "Another process": the module is the same, but nothing it held is left.
function reborn(game) {
  const snap = JSON.parse(JSON.stringify(G.snapshot(game)));
  G._reset();
  return { snap, game: G.hydrate(snap) };
}

describe('snapshot', () => {
  test('is plain JSON: Maps folded, timers / streams / deck left out, nothing lost', () => {
    const g = G.createGame({ hostId: HOST, drill: 'facts', playbook: 'mul', mode: 'drive', cls: { id: 'c1', name: 'Algebra 1 · P3' } });
    const { token, player } = G.join(g, 'Ana', { userId: 'u1' });
    G.start(g);
    const { n } = G.currentPlay(g, player);
    jest.advanceTimersByTime(900);
    G.answer(g, player, n, keyOf(g, n));
    const snap = G.snapshot(g);
    expect(JSON.parse(JSON.stringify(snap))).toEqual(snap);
    for (const k of ['timers', 'listeners', 'pending', 'deck']) expect(snap).not.toHaveProperty(k);
    expect(snap.players.__map).toHaveLength(1);
    expect(snap.players.__map[0][1].facts.__map).toHaveLength(1);
    expect(snap.classId).toBe('c1');
    expect(snap.byToken.__map[0][1]).toBe(player.id);
    expect(G.playerFor(g, token)).toBe(player);
  });
});

describe('hydrate (a drive mid-play)', () => {
  function midDrive() {
    const g = G.createGame({ hostId: HOST, drill: 'algebra', playbook: 'all', mode: 'drive', seconds: 120 });
    const ana = G.join(g, 'Ana');
    const ben = G.join(g, 'Ben', { userId: 'u-ben' });
    G.start(g);
    const a1 = G.currentPlay(g, ana.player);
    jest.advanceTimersByTime(2000);
    G.answer(g, ana.player, a1.n, keyOf(g, a1.n));
    const a2 = G.currentPlay(g, ana.player); // play 2 shown, clock running
    jest.advanceTimersByTime(30000); // 32 s in, 88 s left
    return { g, ana, ben, a2 };
  }

  test('the same code, seats, tokens, scores and version', () => {
    const { g, ana, ben } = midDrive();
    const before = G.hostView(g);
    const { game: h } = reborn(g);
    expect(h).not.toBe(g);
    expect(G.getGame(g.code)).toBe(h);
    expect(G.hostGame(g.code, HOST)).toBe(h);
    expect(() => G.hostGame(g.code, 'someone-else')).toThrow(/not found/);
    expect(G.playerFor(h, ana.token).name).toBe('Ana');
    expect(G.playerFor(h, ben.token).userId).toBe('u-ben');
    const after = G.hostView(h);
    expect(after.version).toBe(before.version);
    expect(after.teams).toEqual(before.teams);
    expect(after.players.map((p) => [p.name, p.yards, p.comp, p.att])).toEqual(before.players.map((p) => [p.name, p.yards, p.comp, p.att]));
    expect(after.endsAt).toBe(before.endsAt);
  });

  test('the deal is identical: the play a student was looking at is the play they answer', () => {
    const { g, ana, a2 } = midDrive();
    const { game: h } = reborn(g);
    const p = G.playerFor(h, ana.token);
    const cur = G.currentPlay(h, p);
    expect(cur.n).toBe(a2.n);
    expect(cur.play).toEqual(a2.play);
    const res = G.answer(h, p, cur.n, keyOf(g, a2.n)); // the OLD process's deal grades right in the new one
    expect(res.ok).toBe(true);
    expect(G.playerFor(h, ana.token).n).toBe(a2.n + 1);
  });

  test('every seat is "away" until its phone reconnects', () => {
    const { g, ana } = midDrive();
    const res = { write() {}, end() {} };
    G.subscribe(g, { kind: 'player', playerId: ana.player.id, res });
    expect(ana.player.conns).toBe(1);
    const { game: h } = reborn(g);
    expect(G.playerFor(h, ana.token).conns).toBe(0);
    expect(h.listeners.size).toBe(0);
  });

  test('the clock ends when it always would have, and a signed-in game still saves', () => {
    const { g } = midDrive();
    const { game: h } = reborn(g);
    const over = jest.fn();
    G.onGameOver(over);
    jest.advanceTimersByTime(87000);
    expect(h.phase).toBe('live');
    jest.advanceTimersByTime(1000 + 1500 + 10);
    expect(h.phase).toBe('over');
    expect(over).toHaveBeenCalledWith(h);
  });

  test('a snapshot from before 0:00 revived after it ends at once', () => {
    const { g } = midDrive();
    const snap = G.snapshot(g);
    G._reset();
    jest.advanceTimersByTime(5 * 60 * 1000);
    const h = G.hydrate(snap);
    jest.advanceTimersByTime(1);
    expect(h.phase).toBe('over');
  });

  test('a code this process already holds is left alone', () => {
    const { g } = midDrive();
    const snap = G.snapshot(g);
    expect(G.hydrate(snap)).toBe(g);
    expect(G.hydrate(null)).toBeNull();
    expect(G.hydrate({ ...snap, code: 'ZZZZZZ', drill: 'no-such-drill' })).toBeNull();
    expect(G.getGame('ZZZZZZ')).toBeNull();
  });
});

describe('hydrate (huddle and hill)', () => {
  test('an open Huddle round closes on its own clock, and the reveal carries the answers', () => {
    const g = G.createGame({ hostId: HOST, drill: 'geometry', playbook: 'all', mode: 'huddle', plays: 5, secondsPerPlay: 20 });
    const ana = G.join(g, 'Ana');
    G.join(g, 'Ben');
    G.start(g);
    const play = G.playAt(g, 1);
    jest.advanceTimersByTime(4000);
    G.answer(g, ana.player, 1, play.answer);
    jest.advanceTimersByTime(6000); // 10 s into a 20 s round
    const { game: h } = reborn(g);
    expect(h.phase).toBe('live');
    expect(h.round.n).toBe(1);
    expect(h.round.answers.get(ana.player.id)).toEqual({ k: play.answer, ms: 4000 });
    jest.advanceTimersByTime(9000);
    expect(h.phase).toBe('live');
    jest.advanceTimersByTime(1000 + 300 + 10);
    expect(h.phase).toBe('reveal');
    expect(h.players.get(ana.player.id).comp).toBe(1);
    G.advance(h);
    expect(h.round.n).toBe(2);
  });

  test('a Huddle reveal (no clock) waits for the teacher', () => {
    const g = G.createGame({ hostId: HOST, drill: 'geometry', playbook: 'all', mode: 'huddle', plays: 5, secondsPerPlay: 20 });
    G.join(g, 'Ana');
    G.start(g);
    G.advance(g); // close round 1 → reveal
    const { game: h } = reborn(g);
    jest.advanceTimersByTime(60000);
    expect(h.phase).toBe('reveal');
    expect(h.timers.size).toBe(0);
  });

  test('King of the Hill keeps every climber where they were', () => {
    const g = G.createGame({ hostId: HOST, drill: 'facts', playbook: 'mul', mode: 'hill', seconds: 120 });
    const ana = G.join(g, 'Ana');
    G.start(g);
    for (let i = 0; i < 3; i++) {
      const { n } = G.currentPlay(g, ana.player);
      jest.advanceTimersByTime(1000);
      G.answer(g, ana.player, n, keyOf(g, n));
    }
    expect(ana.player.h).toBeGreaterThan(0);
    const { game: h } = reborn(g);
    const p = G.playerFor(h, ana.token);
    expect(p.h).toBe(ana.player.h);
    expect(h.hill.king).toBe(ana.player.id);
    expect(G.hostView(h).hill.climbers[0]).toMatchObject({ name: 'Ana', king: true, h: ana.player.h });
  });

  test('a finished game revives as finished: the final screen and "Run it back" still work', () => {
    const g = G.createGame({ hostId: HOST, drill: 'algebra', playbook: 'all', mode: 'drive', seconds: 60 });
    const ana = G.join(g, 'Ana');
    G.start(g);
    const { n } = G.currentPlay(g, ana.player);
    G.answer(g, ana.player, n, keyOf(g, n));
    G.endGame(g);
    const { game: h } = reborn(g);
    expect(h.phase).toBe('over');
    expect(G.hostView(h).final.players[0].name).toBe('Ana');
    G.rematch(h);
    expect(h.phase).toBe('lobby');
    expect(G.playerFor(h, ana.token).yards).toBe(0);
  });
});

describe('hooks', () => {
  test('every change runs the change hooks; a sweep runs the drop hooks', () => {
    const changed = jest.fn();
    const dropped = jest.fn();
    G.onChange(changed);
    G.onDrop(dropped);
    const g = G.createGame({ hostId: HOST, drill: 'algebra', playbook: 'all', mode: 'drive' });
    expect(changed).toHaveBeenCalledWith(g);
    const before = changed.mock.calls.length;
    G.join(g, 'Ana');
    expect(changed.mock.calls.length).toBeGreaterThan(before);
    G._reset();
    expect(dropped).toHaveBeenCalledWith(g);
  });

  test('a hook that throws never breaks the game', () => {
    G.onChange(() => { throw new Error('db down'); });
    const g = G.createGame({ hostId: HOST, drill: 'algebra', playbook: 'all', mode: 'drive' });
    expect(() => G.join(g, 'Ana')).not.toThrow();
    expect(g.players.size).toBe(1);
  });
});
