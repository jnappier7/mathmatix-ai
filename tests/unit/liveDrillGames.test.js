/**
 * Live Two-Minute Drill — the rules (utils/liveDrill/games.js).
 *
 * What these pin:
 *   - every student in a game sees the same play n, and the server grades it (a device can only
 *     say "I picked k on play n" — never claim yards, replay a play, or answer after 0:00);
 *   - nothing a student's screen receives contains an open play's answer;
 *   - team scoring: pooled, scaled to ~K players, TD = 7 and back to the 25;
 *   - huddle: the round closes the moment everyone has answered; silence is 0, not a sack.
 */
jest.useFakeTimers();
const G = require('../../utils/liveDrill/games');

const HOST = 'teacher-1';
afterEach(() => G._reset());

function drive(opts = {}) { return G.createGame({ hostId: HOST, drill: 'algebra', playbook: 'all', mode: 'drive', ...opts }); }
function huddle(opts = {}) { return G.createGame({ hostId: HOST, drill: 'geometry', playbook: 'all', mode: 'huddle', plays: 5, secondsPerPlay: 20, ...opts }); }
const wrongKey = (play) => play.choices.find((c) => c.k !== play.answer).k;

describe('lobby', () => {
  test('codes are six unambiguous characters', () => {
    const g = drive();
    expect(g.code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
    expect(G.getGame(g.code.toLowerCase())).toBe(g);
  });

  test('teams balance as students join', () => {
    const g = drive();
    const teams = ['A', 'B', 'C', 'D', 'E'].map((n) => G.join(g, n).player.team);
    expect(teams).toEqual([0, 1, 0, 1, 0]);
  });

  test('names are cleaned of markup and deduplicated', () => {
    const g = drive();
    expect(G.join(g, '  <b>Ana</b>  "M." ').player.name).toBe('bAna/b M.');
    expect(G.join(g, 'Sam').player.name).toBe('Sam');
    expect(G.join(g, 'sam').player.name).toBe('sam 2');
    expect(() => G.join(g, '   ')).toThrow(/name/);
  });

  test('a removed player loses their seat', () => {
    const g = drive();
    const { token, player } = G.join(g, 'Kid');
    G.kick(g, player.id);
    expect(() => G.playerFor(g, token)).toThrow(/not in this game/);
    expect(G.hostView(g).players).toHaveLength(0);
  });

  test('another teacher cannot reach the game', () => {
    const g = drive();
    expect(() => G.hostGame(g.code, 'teacher-2')).toThrow(/not found/);
  });

  test('a teacher hosting a fourth game retires their oldest open one', () => {
    const a = drive(); drive(); drive(); drive();
    expect(a.phase).toBe('over');
  });

  test('cannot kick off an empty lobby', () => {
    expect(() => G.start(drive())).toThrow(/Nobody/);
  });
});

describe('team drive', () => {
  test('everyone gets the same play n, dealt by the server', () => {
    const g = drive();
    const a = G.join(g, 'A').player, b = G.join(g, 'B').player;
    G.start(g);
    expect(G.currentPlay(g, a)).toEqual(G.currentPlay(g, b));
  });

  test('a fast right answer is +15, scaled into the team; a wrong one is a sack', () => {
    const g = drive();
    const a = G.join(g, 'A').player;
    G.start(g);
    const { n } = G.currentPlay(g, a);
    jest.advanceTimersByTime(3000);
    const play = G.playAt(g, n);
    const r = G.answer(g, a, n, play.answer);
    expect(r).toMatchObject({ ok: true, gain: 15 });
    expect(g.teams[0].pos).toBe(G.START_POS + 15); // a team of one moves like a solo player

    G.currentPlay(g, a);
    jest.advanceTimersByTime(13000);
    const r2 = G.answer(g, a, 2, wrongKey(G.playAt(g, 2)));
    expect(r2).toMatchObject({ ok: false, gain: -5 });
    expect(g.teams[0].pos).toBe(G.START_POS + 10);
    expect(a).toMatchObject({ att: 2, comp: 1, yards: 10, streak: 0 });
  });

  test('speed thresholds follow the drill: ≤6 s +15, ≤12 s +10, slower +5', () => {
    const g = drive();
    const a = G.join(g, 'A').player;
    G.start(g);
    const gains = [2000, 9000, 20000].map((ms, i) => {
      G.currentPlay(g, a);
      jest.advanceTimersByTime(ms);
      return G.answer(g, a, i + 1, G.playAt(g, i + 1).answer).gain;
    });
    expect(gains).toEqual([15, 10, 5]);
  });

  test('a big team moves like K players, not like the sum of everyone', () => {
    const g = drive();
    const ps = Array.from({ length: 16 }, (_, i) => G.join(g, 'P' + i).player); // 8 a side
    G.start(g);
    const red = ps.filter((p) => p.team === 0)[0];
    G.currentPlay(g, red);
    G.answer(g, red, 1, G.playAt(g, 1).answer);
    expect(g.teams[0].pos).toBeCloseTo(G.START_POS + (15 * G.TEAM_K.drive) / 8);
  });

  test('crossing the goal line scores 7 and the next drive starts at the 25', () => {
    const g = drive();
    const a = G.join(g, 'A').player;
    G.start(g);
    for (let n = 1; n <= 5; n++) { G.currentPlay(g, a); G.answer(g, a, n, G.playAt(g, n).answer); }
    expect(g.teams[0]).toMatchObject({ pts: 7, tds: 1, pos: G.START_POS });
  });

  test('a play cannot be answered twice, out of order, or before it is shown', () => {
    const g = drive();
    const a = G.join(g, 'A').player;
    G.start(g);
    expect(() => G.answer(g, a, 1, G.playAt(g, 1).answer)).toThrow(/already over/); // never fetched
    G.currentPlay(g, a);
    G.answer(g, a, 1, G.playAt(g, 1).answer);
    expect(() => G.answer(g, a, 1, G.playAt(g, 1).answer)).toThrow(/already over/);
    expect(() => G.answer(g, a, 5, 'x')).toThrow(/already over/);
    G.currentPlay(g, a);
    expect(() => G.answer(g, a, 2, 'not-a-choice')).toThrow(/Not one of the choices/);
  });

  test('the clock is the server’s: the game ends on time and late answers do not count', () => {
    const g = drive({ seconds: 60 });
    const a = G.join(g, 'A').player;
    G.start(g);
    G.currentPlay(g, a);
    jest.advanceTimersByTime(61600);
    expect(g.phase).toBe('over');
    expect(() => G.answer(g, a, 1, G.playAt(g, 1).answer)).toThrow(/run out/);
  });

  test('the host’s final has MVPs and the class film room', () => {
    const g = drive();
    const a = G.join(g, 'A').player, b = G.join(g, 'B').player;
    G.start(g);
    G.currentPlay(g, a); G.answer(g, a, 1, wrongKey(G.playAt(g, 1)));
    G.currentPlay(g, b); G.answer(g, b, 1, wrongKey(G.playAt(g, 1)));
    G.endGame(g);
    const v = G.hostView(g);
    expect(v.final.film[0]).toMatchObject({ count: 2, id: G.playAt(g, 1).id });
    expect(v.final.film[0].commonPick).toBeTruthy();
    expect(v.final.mvps[0][0].name).toBe('A');
    expect(G.playerView(g, a).film).toHaveLength(1);
  });
});

describe('huddle', () => {
  test('the round closes as soon as everyone has answered, and the reveal counts the split', () => {
    const g = huddle();
    const a = G.join(g, 'A').player, b = G.join(g, 'B').player;
    G.start(g);
    const play = G.playAt(g, 1);
    G.answer(g, a, 1, play.answer);
    expect(g.round.closed).toBe(false);
    G.answer(g, b, 1, wrongKey(play));
    expect(g.phase).toBe('reveal');
    const v = G.hostView(g).round;
    expect(v.counts[play.answer]).toBe(1);
    expect(v.rightByTeam).toEqual([1, 0]);
    expect(G.playerView(g, b).round.mine).toMatchObject({ ok: false, gain: -5 });
  });

  test('time runs out on a round; silence is 0 yards, not a sack', () => {
    const g = huddle();
    const a = G.join(g, 'A').player; G.join(g, 'B');
    G.start(g);
    jest.advanceTimersByTime(5000);
    G.answer(g, a, 1, G.playAt(g, 1).answer);
    jest.advanceTimersByTime(16000);
    expect(g.phase).toBe('reveal');
    expect(g.teams[0].pos).toBe(G.START_POS + 15); // 5 s of a 20 s window = first third
    expect(g.teams[1].pos).toBe(G.START_POS);
  });

  test('one answer per student per play, and none after the reveal', () => {
    const g = huddle();
    const a = G.join(g, 'A').player; G.join(g, 'B');
    G.start(g);
    G.answer(g, a, 1, G.playAt(g, 1).answer);
    expect(() => G.answer(g, a, 1, G.playAt(g, 1).answer)).toThrow(/already answered/);
    G.advance(g); // teacher reveals early
    expect(g.phase).toBe('reveal');
    const late = G.join(g, 'Late').player;
    expect(() => G.answer(g, late, 1, G.playAt(g, 1).answer)).toThrow(/closed/);
  });

  test('the teacher advances through every play, then to the final', () => {
    const g = huddle({ plays: 5 });
    G.join(g, 'A');
    G.start(g);
    for (let n = 1; n <= 5; n++) {
      expect(g.round.n).toBe(n);
      G.advance(g); // reveal
      G.advance(g); // next (or final)
    }
    expect(g.phase).toBe('over');
  });

  test('an open play never reaches a screen with its answer', () => {
    const g = huddle();
    const a = G.join(g, 'A').player; G.join(g, 'B');
    G.start(g);
    const play = G.playAt(g, 1);
    const pv = JSON.stringify(G.playerView(g, a));
    const hv = JSON.stringify(G.hostView(g));
    for (const s of [pv, hv]) {
      expect(s).not.toContain('"answer"');
      expect(s).not.toContain(play.tell);
      expect(s).not.toContain('revealCard');
    }
  });
});

describe('class games and signed-in students', () => {
  test('a game tied to a class is listed for that class only, and only while open', () => {
    expect(G.anyClassGames()).toBe(false);
    const g = drive({ cls: { id: 'class-1', name: 'Algebra 1 · P3' }, hostName: 'Jason Nappier' });
    drive(); // a code-only game is never listed
    expect(G.anyClassGames()).toBe(true);
    expect(G.gamesForClasses(['class-1'])).toEqual([expect.objectContaining({ code: g.code, className: 'Algebra 1 · P3', hostName: 'Jason Nappier' })]);
    expect(G.gamesForClasses(['class-2'])).toEqual([]);
    G.endGame(g);
    expect(G.gamesForClasses(['class-1'])).toEqual([]);
  });

  test('an account joins once: a second device reseats the same player', () => {
    const g = drive();
    const a = G.join(g, 'Marcus T.', { userId: 'u1' });
    const b = G.join(g, 'Marcus T.', { userId: 'u1' });
    expect(b.player).toBe(a.player);
    expect(b.token).not.toBe(a.token);
    expect(G.playerFor(g, a.token)).toBe(a.player); // the first device keeps working too
    expect(G.hostView(g).players).toEqual([expect.objectContaining({ name: 'Marcus T.', linked: true })]);
  });

  test('a student the teacher removed cannot rejoin with their account', () => {
    const g = drive();
    const { player } = G.join(g, 'Kid K.', { userId: 'u9' });
    G.kick(g, player.id);
    expect(() => G.join(g, 'Kid K.', { userId: 'u9' })).toThrow(/removed/);
  });
});

describe('huddle waits only for screens that are open', () => {
  const fakeRes = () => ({ write() {}, end() {} });

  test('a student whose phone went to sleep does not hold the round', () => {
    const g = huddle();
    const a = G.join(g, 'A').player, b = G.join(g, 'B').player;
    G.join(g, 'Asleep');
    G.subscribe(g, { kind: 'player', playerId: a.id, res: fakeRes() });
    G.subscribe(g, { kind: 'player', playerId: b.id, res: fakeRes() });
    G.start(g);
    expect(G.hostView(g).round.expected).toBe(2);
    G.answer(g, a, 1, G.playAt(g, 1).answer);
    G.answer(g, b, 1, G.playAt(g, 1).answer);
    expect(g.phase).toBe('reveal');
  });

  test('the round closes when the last student it was waiting on puts the phone down', () => {
    const g = huddle();
    const a = G.join(g, 'A').player, b = G.join(g, 'B').player;
    G.subscribe(g, { kind: 'player', playerId: a.id, res: fakeRes() });
    const leaveB = G.subscribe(g, { kind: 'player', playerId: b.id, res: fakeRes() });
    G.start(g);
    G.answer(g, a, 1, G.playAt(g, 1).answer);
    expect(g.round.closed).toBe(false);
    leaveB();
    expect(g.phase).toBe('reveal');
  });

  test('removing the one student the round waits on closes it', () => {
    const g = huddle();
    const a = G.join(g, 'A').player, b = G.join(g, 'B').player;
    G.subscribe(g, { kind: 'player', playerId: a.id, res: fakeRes() });
    G.subscribe(g, { kind: 'player', playerId: b.id, res: fakeRes() });
    G.start(g);
    G.answer(g, a, 1, G.playAt(g, 1).answer);
    G.kick(g, b.id);
    expect(g.phase).toBe('reveal');
  });
});

describe('run it back', () => {
  test('same code, same seats and teams; fresh deal and a clean scoreboard', () => {
    const g = drive();
    const { token, player } = G.join(g, 'A');
    G.join(g, 'B');
    G.start(g);
    G.currentPlay(g, player);
    G.answer(g, player, 1, G.playAt(g, 1).answer);
    const firstDeck = [1, 2, 3, 4, 5].map((n) => G.playAt(g, n).card).join();
    expect(() => G.rematch(g)).toThrow(/Finish/);
    G.endGame(g);
    const code = g.code;
    G.rematch(g);
    expect(g.code).toBe(code);
    expect(g.phase).toBe('lobby');
    expect(G.playerFor(g, token)).toBe(player);
    expect(player).toMatchObject({ att: 0, comp: 0, yards: 0, n: 1, team: 0 });
    expect(g.teams.map((t) => [t.pts, t.pos])).toEqual([[0, G.START_POS], [0, G.START_POS]]);
    expect(G.hostView(g)).toMatchObject({ gameNumber: 2, players: [expect.anything(), expect.anything()] });
    expect([1, 2, 3, 4, 5].map((n) => G.playAt(g, n).card).join()).not.toBe(firstDeck);
    G.start(g);
    expect(g.phase).toBe('live');
  });
});

describe('screens', () => {
  test('a student’s view has their own numbers and nobody else’s', () => {
    const g = drive();
    const a = G.join(g, 'A').player; G.join(g, 'B');
    const v = G.playerView(g, a);
    expect(v.me.name).toBe('A');
    expect(v.players).toBeUndefined();
    expect(JSON.stringify(v)).not.toContain('"B"');
  });
});
