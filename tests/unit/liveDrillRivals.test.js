/**
 * Live drill — every game, played alone: computer rivals (utils/liveDrill/rivals.js).
 *
 * Owner, 2026-11-21: "Possible to allow all of the games to be played individually without a
 * class?" A solo game is an ordinary game with one student and a few seats filled by the computer.
 *
 * What these pin:
 *   - a solo game seats ONE student and the rivals, every rival is named as a computer, and the
 *     student is the only one who can start it, deal the next Huddle play, or run it back;
 *   - ALL FIVE GAMES play to the end with a student in them (and Knockout Arena in both of its
 *     kinds: Math Facts and Triangle Congruence);
 *   - a rival is a model of a student, not an oracle: it is wrong some of the time, it never
 *     answers faster than a person could, an alarm locks it, a smoke bomb blinds it, and its car
 *     never moves faster than a car can;
 *   - the three levels are really three levels: a typical student beats Easy most of the time and
 *     loses to Hard most of the time;
 *   - Huddle waits for the student (and moves on by itself only if they have walked off);
 *   - housekeeping: a student who has gone ends the game, a device has one solo game at a time,
 *     solo games never count against (or take a slot from) class games, are never shadowed to
 *     Mongo, and are swept minutes after they finish;
 *   - what a finished game files to a signed-in student's history, and that a guest files nothing.
 */
jest.useFakeTimers();
const fs = require('fs');
const path = require('path');
const G = require('../../utils/liveDrill/games');
const R = require('../../utils/liveDrill/rivals');
const K = require('../../utils/liveDrill/knockout');

afterEach(() => G._reset());

let dev = 0;
/** Open a solo game with fixed seeds, so a run replays the same way. */
function open(opts = {}) {
  const out = R.open({ drill: 'facts', playbook: 'mul', mode: 'drive', seconds: 120, name: 'Stu', owner: `device${++dev}`, hub: 'algebra', ...opts });
  if (opts.seed) { out.game.seed = opts.seed; R._arm(out.game); }
  out.player.conns = 1; // the student's screen is open
  return out;
}
const student = (profile, seed) => ({ ...profile, rnd: R.rng(`student:${seed}`), due: 0, n: 0, answerAt: 0, safeAt: 0, pickAt: 0, round: 0 });
const TYPICAL = { acc: 0.7, pace: 1.1 };
const STRONG = { acc: 0.92, pace: 0.85 };

/** Play a whole solo game with a simulated student (a seat driven by a profile, exactly as a rival's is). */
function playSolo({ profile = TYPICAL, seed = 's', ...opts }) {
  const { game, player } = open({ seed: `g:${seed}`, ...opts });
  const b = student(profile, seed);
  R.begin(game, player);
  let guard = 0;
  while (game.phase !== 'over' && guard++ < 30000) {
    const at = Date.now();
    if (game.mode === 'huddle') {
      if (game.phase === 'live' && game.round && !game.round.closed) R.huddleSeat(game, player, game.round, at, b);
      else if (game.phase === 'reveal') R.next(game, player);
    } else if (game.mode === 'knockout') {
      if (player.ko.in) R.carTick(game, player, game.ko.round, at, b); else R.paceTick(game, player, at, b);
    } else R.paceTick(game, player, at, b);
    jest.advanceTimersByTime(R.TICK_MS);
  }
  return { game, player };
}
/** Where the student finished: 1 = won. */
function placeOf(game, player) {
  if (game.mode === 'drive' || game.mode === 'huddle') {
    const [a, b] = game.teams;
    const w = a.pts !== b.pts ? (a.pts > b.pts ? 0 : 1) : (a.pos >= b.pos ? 0 : 1);
    return w === player.team ? 1 : 2;
  }
  if (game.mode === 'hill') return [...game.players.values()].sort((x, y) => y.h - x.h).indexOf(player) + 1;
  if (game.mode === 'heist') return [...game.players.values()].sort((x, y) => y.cash - x.cash).indexOf(player) + 1;
  return G.playerView(game, player).knockout.place;
}

describe('a solo game', () => {
  test.each(G.MODES)('%s: one student, the rivals it seats, all of them named as computers, waiting in the lobby', (mode) => {
    const { game, player, token } = open({ mode });
    const bots = R.rivalsOf(game);
    expect(game.phase).toBe('lobby');
    expect(game.solo).toMatchObject({ level: 'medium', hub: 'algebra', humanId: player.id });
    expect(bots).toHaveLength(R.RIVALS[mode]);
    expect([...game.players.values()].filter((p) => !p.bot)).toEqual([player]);
    for (const b of bots) {
      expect(b.name.endsWith(R.TAG)).toBe(true);
      expect(b.userId).toBeNull(); // nothing a rival does is ever filed to anyone
      expect(new Set(bots.map((x) => x.name)).size).toBe(bots.length);
    }
    expect(G.playerFor(game, token)).toBe(player);
    expect(G.playerView(game, player).solo).toEqual({ level: 'medium', hub: 'algebra', rivals: R.RIVALS[mode], saves: false });
    // the two team games are one against one
    if (mode === 'drive' || mode === 'huddle') expect([player.team, bots[0].team]).toEqual([0, 1]);
  });

  test('a class game says nothing about rivals, and nobody can start one from a phone', () => {
    const g = G.createGame({ hostId: 't1', drill: 'facts', playbook: 'mul', mode: 'drive' });
    const { player } = G.join(g, 'Ana');
    expect(G.playerView(g, player).solo).toBeNull();
    expect(g.solo).toBeNull();
    for (const fn of [() => R.begin(g, player), () => R.next(g, player), () => R.again(g, player)]) expect(fn).toThrow(/solo game/);
    expect(g.phase).toBe('lobby');
  });

  test('only the student starts it, and only once; a rival cannot', () => {
    const { game, player } = open({ mode: 'heist' });
    expect(() => R.begin(game, R.rivalsOf(game)[0])).toThrow(/solo game/);
    R.begin(game, player);
    expect(game.phase).toBe('live');
    expect(() => R.begin(game, player)).toThrow(/already kicked off/);
  });

  test('an unknown level is Medium; an unknown game is refused; Knockout Arena refuses a drill it cannot play', () => {
    expect(open({ level: 'impossible' }).game.solo.level).toBe('medium');
    expect(open({ level: 'hard' }).game.solo.level).toBe('hard');
    expect(() => open({ mode: 'chess' })).toThrow(/No such game/);
    expect(() => open({ mode: 'knockout', drill: 'algebra', playbook: 'all' })).toThrow(/Knockout Arena plays/);
    expect(R.modesFor('algebra', 'all')).toEqual(['drive', 'huddle', 'hill', 'heist']);
    expect(R.modesFor('facts', 'mul')).toEqual(G.MODES);
    expect(R.modesFor('congruence', 'all')).toEqual(G.MODES);
  });
});

describe('all five games play to the end', () => {
  test.each([
    ['drive', 'algebra', 'all'], ['drive', 'facts', 'mul'], ['huddle', 'algebra', 'all'], ['hill', 'geometry', 'all'],
    ['hill', 'facts', 'add'], ['heist', 'algebra', 'all'], ['heist', 'facts', 'all'], ['knockout', 'facts', 'mul'], ['knockout', 'congruence', 'all'],
  ])('%s · %s', (mode, drill, playbook) => {
    const { game, player } = playSolo({ mode, drill, playbook, seed: `${mode}${drill}` });
    expect(game.phase).toBe('over');
    const bots = R.rivalsOf(game);
    // everyone played: the student answered, and so did the rivals (in the arena, a car that was never knocked out answers nothing)
    if (mode !== 'knockout') {
      expect(player.att).toBeGreaterThan(3);
      for (const b of bots) expect(b.att).toBeGreaterThan(2);
    } else {
      expect(game.ko.rounds).toBeGreaterThanOrEqual(R.RIVALS.knockout); // one car out a round
      expect(bots.some((b) => b.ko.grabbed > 0)).toBe(true);
      expect(G.playerView(game, player).knockout.place).toBeGreaterThanOrEqual(1);
    }
    expect(placeOf(game, player)).toBeGreaterThanOrEqual(1);
  });

  test('Huddle plays every play: the rival always gets an answer in, and the student deals each next one', () => {
    const { game, player } = playSolo({ mode: 'huddle', drill: 'facts', playbook: 'mul', seed: 'hud' });
    const [bot] = R.rivalsOf(game);
    expect(game.round.n).toBe(game.totalPlays);
    expect(bot.att).toBe(game.totalPlays);
    expect(bot.noAnswers).toBe(0);
    expect(player.att).toBe(game.totalPlays);
  });
});

describe('a rival is a model of a student, not an oracle', () => {
  test('it is wrong some of the time: about as often as its level says', () => {
    for (const [level, lo, hi] of [['easy', 0.38, 0.72], ['medium', 0.55, 0.85], ['hard', 0.76, 0.98]]) {
      let att = 0; let comp = 0;
      for (let i = 0; i < 6; i++) {
        const { game } = playSolo({ mode: 'drive', level, seed: `acc${level}${i}` });
        const [bot] = R.rivalsOf(game);
        att += bot.att; comp += bot.comp;
      }
      expect(att).toBeGreaterThan(60);
      expect(comp / att).toBeGreaterThan(lo);
      expect(comp / att).toBeLessThan(hi);
    }
  });

  test('it never answers faster than a person could, and it is timed from when its play was dealt', () => {
    const fast = G.scoringFor({ drill: 'facts' }).driveMs[0];
    for (const level of ['easy', 'medium', 'hard']) {
      const { game } = playSolo({ mode: 'hill', drill: 'facts', playbook: 'add', level, seed: `speed${level}` });
      for (const bot of R.rivalsOf(game)) {
        const times = bot.factLog.map((x) => x.ms);
        expect(times.length).toBeGreaterThan(5);
        expect(Math.min(...times)).toBeGreaterThanOrEqual(fast * R.THINK.floor); // 1.2 s on a fact
      }
    }
    // harder rivals think faster — and still never under the floor
    const mean = (level) => { const b = { ...R.profile(level, 0, 1), rnd: R.rng(level) }; let t = 0; for (let i = 0; i < 400; i++) t += R.thinkMs({ drill: 'facts' }, b); return t / 400; };
    expect(mean('easy')).toBeGreaterThan(mean('medium'));
    expect(mean('medium')).toBeGreaterThan(mean('hard'));
  });

  test('a field is not five clones: the rivals of one level differ, weakest to strongest', () => {
    const ps = [0, 1, 2, 3, 4].map((i) => R.profile('medium', i, 5));
    for (let i = 1; i < ps.length; i++) { expect(ps[i].acc).toBeGreaterThan(ps[i - 1].acc); expect(ps[i].pace).toBeLessThan(ps[i - 1].pace); }
    expect(R.profile('medium', 0, 1)).toEqual({ acc: R.LEVELS.medium.acc, pace: R.LEVELS.medium.pace });
    for (const level of Object.keys(R.LEVELS)) for (const p of [0, 1, 2, 3, 4].map((i) => R.profile(level, i, 5))) expect(p.acc).toBeLessThan(1);
  });

  test('Heist: an alarm locks a rival like anyone — the server holds it, whatever the rival wants', () => {
    const { game, player } = open({ mode: 'heist', seed: 'alarm' });
    R.begin(game, player);
    let alarms = 0;
    for (let i = 0; i < 600 && game.phase === 'live'; i++) {
      jest.advanceTimersByTime(R.TICK_MS);
      for (const b of R.rivalsOf(game)) {
        if (b.lockUntil <= Date.now()) continue;
        alarms++;
        const att = b.att;
        expect(() => G.answer(game, b, b.n, '0')).toThrow(/alarm/);
        expect(b.att).toBe(att);
      }
    }
    expect(alarms).toBeGreaterThan(0);
    for (const b of R.rivalsOf(game)) expect(b.alarms + b.safes).toBeGreaterThan(0);
  });

  test('Heist: a smoke bomb the student fires blinds every rival for as long as it lasts', () => {
    const { game, player } = open({ mode: 'heist', seed: 'fog' });
    R.begin(game, player);
    jest.advanceTimersByTime(20000);
    player.gadgets.push({ id: 'g-test', kind: 'smoke' });
    const fx = G.useGadget(game, player, 'g-test');
    const before = R.rivalsOf(game).map((b) => b.att);
    jest.advanceTimersByTime(fx.until - Date.now() - 300);
    expect(R.rivalsOf(game).map((b) => b.att)).toEqual(before);
    jest.advanceTimersByTime(20000);
    expect(R.rivalsOf(game).map((b) => b.att).reduce((a, b) => a + b, 0)).toBeGreaterThan(before.reduce((a, b) => a + b, 0));
  });

  test('Knockout Arena: a rival car drives no faster than a car can, waits out think time, and grabs from where it is', () => {
    const { game, player } = open({ mode: 'knockout', drill: 'congruence', playbook: 'all', seed: 'cars' });
    R.begin(game, player);
    const r = game.ko.round;
    const start = R.rivalsOf(game).map((b) => [b.ko.x, b.ko.y]);
    jest.advanceTimersByTime(r.goAt - Date.now() - 50);
    expect(R.rivalsOf(game).map((b) => [b.ko.x, b.ko.y])).toEqual(start); // nobody moves before GO
    expect(R.rivalsOf(game).every((b) => !b.ko.held.length)).toBe(true);
    let top = 0;
    for (let i = 0; i < 200 && game.phase === 'live'; i++) {
      jest.advanceTimersByTime(R.TICK_MS);
      for (const b of R.rivalsOf(game)) top = Math.max(top, Math.hypot(b.ko.vx || 0, b.ko.vy || 0));
    }
    expect(top).toBeGreaterThan(0);
    expect(top).toBeLessThanOrEqual(K.TUNE.speed * R.ARENA.drive[1] + 1);
    expect(R.rivalsOf(game).some((b) => b.ko.grabbed > 0)).toBe(true);
    // power-ups are left on the floor for the student
    expect(R.rivalsOf(game).every((b) => !b.ko.powers && !b.ko.boosts)).toBe(true);
  });

  test('Knockout Arena: a rival that is knocked out answers in the pit like anyone', () => {
    const { game } = playSolo({ mode: 'knockout', drill: 'facts', playbook: 'mul', seed: 'pit', profile: STRONG });
    const out = R.rivalsOf(game).filter((b) => b.ko.outAt);
    expect(out.length).toBeGreaterThan(0);
    expect(out.some((b) => b.att > 0)).toBe(true);
  });
});

describe('three levels', () => {
  const wins = (level, profile, mode = 'drive', n = 14) => {
    let w = 0;
    for (let i = 0; i < n; i++) { const { game, player } = playSolo({ mode, level, profile, seed: `lv${mode}${level}${i}` }); if (placeOf(game, player) === 1) w++; }
    return w;
  };

  test('Team Drive, one against one: a typical student beats Easy most of the time and loses to Hard most of the time', () => {
    const easy = wins('easy', TYPICAL); const medium = wins('medium', TYPICAL); const hard = wins('hard', TYPICAL);
    expect(easy).toBeGreaterThanOrEqual(11);
    expect(hard).toBeLessThanOrEqual(4);
    expect(easy).toBeGreaterThanOrEqual(medium);
    expect(medium).toBeGreaterThanOrEqual(hard);
  });

  test('…and Hard is beatable: a strong student wins more often than not', () => {
    expect(wins('hard', STRONG)).toBeGreaterThanOrEqual(8);
  });

  test('a field of five: a typical student finishes mid-table on Medium, near the top on Easy, near the bottom on Hard', () => {
    const avg = (level) => { let s = 0; for (let i = 0; i < 10; i++) { const { game, player } = playSolo({ mode: 'hill', level, seed: `hill${level}${i}` }); s += placeOf(game, player); } return s / 10; };
    const easy = avg('easy'); const medium = avg('medium'); const hard = avg('hard');
    expect(easy).toBeLessThan(2.5);
    expect(medium).toBeGreaterThan(1.3); expect(medium).toBeLessThan(4.8);
    expect(hard).toBeGreaterThan(4);
  });
});

describe('Huddle, alone', () => {
  test('the round closes as soon as both have answered, and then it waits for the student', () => {
    const { game, player } = open({ mode: 'huddle', seed: 'wait' });
    R.begin(game, player);
    const [bot] = R.rivalsOf(game);
    jest.advanceTimersByTime(game.secondsPerPlay * 1000 - 500);
    expect(game.round.answers.has(bot.id)).toBe(true); // the rival is in, well before the clock
    expect(game.phase).toBe('live');
    G.answer(game, player, 1, G.playAt(game, 1).answer);
    expect(game.phase).toBe('reveal');
    jest.advanceTimersByTime(R.REVEAL_MAX_MS - 2000);
    expect(game.round.n).toBe(1); // reading the answer is not on a clock
    R.next(game, player);
    expect(game.round.n).toBe(2);
    expect(game.phase).toBe('live');
  });

  test('a student who walks off mid-reveal does not leave the game stuck', () => {
    const { game, player } = open({ mode: 'huddle', seed: 'stuck' });
    R.begin(game, player);
    G.answer(game, player, 1, G.playAt(game, 1).answer);
    jest.advanceTimersByTime(game.secondsPerPlay * 1000);
    expect(game.phase).toBe('reveal');
    jest.advanceTimersByTime(R.REVEAL_MAX_MS + 1000);
    expect(game.round.n).toBe(2);
  });

  test('"next" is Huddle\'s alone', () => {
    const { game, player } = open({ mode: 'drive' });
    R.begin(game, player);
    expect(() => R.next(game, player)).toThrow(/Only Huddle/);
  });
});

describe('play it again', () => {
  test('the same seat and the same rivals, a fresh deal, back to the lobby — at a new level if one is picked', () => {
    const { game, player } = playSolo({ mode: 'heist', seed: 'again' });
    const seed = game.seed; const ids = [...game.players.keys()];
    expect(() => R.again(game, R.rivalsOf(game)[0])).toThrow(/solo game/);
    R.again(game, player, 'hard');
    expect(game.phase).toBe('lobby');
    expect(game.seed).not.toBe(seed);
    expect([...game.players.keys()]).toEqual(ids);
    expect(game.solo.level).toBe('hard');
    expect(R.rivalsOf(game).every((b) => b.cash === 0 && b.att === 0)).toBe(true);
    expect(R.rivalsOf(game)[2].bot.acc).toBeCloseTo(R.profile('hard', 2, 5).acc);
    R.begin(game, player);
    jest.advanceTimersByTime(30000);
    expect(R.rivalsOf(game).some((b) => b.att > 0)).toBe(true); // the rivals are playing again
    G.endGame(game);
    R.again(game, player, 'legendary'); // a level that does not exist keeps the one it had
    expect(game.solo.level).toBe('hard');
  });

  test('it cannot be run back while it is still being played', () => {
    const { game, player } = open({ mode: 'drive' });
    R.begin(game, player);
    expect(() => R.again(game, player)).toThrow(/Finish this game first/);
  });
});

describe('housekeeping', () => {
  test('a student whose screen has been closed for a while ends the game; one who is still there does not', () => {
    const gone = open({ mode: 'hill', seed: 'gone' });
    R.begin(gone.game, gone.player);
    gone.player.conns = 0; // the tab closed
    jest.advanceTimersByTime(R.AWAY_MS - 2000);
    expect(gone.game.phase).toBe('live');
    jest.advanceTimersByTime(4000);
    expect(gone.game.phase).toBe('over');

    const here = open({ mode: 'hill', seed: 'here' });
    R.begin(here.game, here.player);
    jest.advanceTimersByTime(R.AWAY_MS + 20000); // thinking, screen open
    expect(here.game.phase).toBe('live');
  });

  test('a finished game stops its rivals: nothing answers after the buzzer', () => {
    const { game } = playSolo({ mode: 'drive', seed: 'stop' });
    const att = R.rivalsOf(game).map((b) => b.att);
    expect(game.timers.size).toBe(0);
    jest.advanceTimersByTime(60000);
    expect(R.rivalsOf(game).map((b) => b.att)).toEqual(att);
  });

  test('one solo game per device: opening another closes the last', () => {
    const a = R.open({ drill: 'facts', playbook: 'mul', mode: 'drive', owner: 'my-phone-1234' });
    const b = R.open({ drill: 'facts', playbook: 'mul', mode: 'heist', owner: 'my-phone-1234' });
    const c = R.open({ drill: 'facts', playbook: 'mul', mode: 'heist', owner: 'other-phone-99' });
    expect(G.getGame(a.game.code)).toBeNull();
    expect(G.getGame(b.game.code)).toBe(b.game);
    expect(G.getGame(c.game.code)).toBe(c.game);
  });

  test('solo games have their own ceiling, and never take a slot from (or block) a class game', () => {
    for (let i = 0; i < G.MAX_SOLO_GAMES; i++) R.open({ drill: 'facts', playbook: 'mul', mode: 'drive', owner: `filler-device-${i}` });
    expect(() => R.open({ drill: 'facts', playbook: 'mul', mode: 'drive', owner: 'one-too-many-1' })).toThrow(/Every seat against the computer is taken/);
    // a teacher is not affected: the class ceiling counts class games only
    const g = G.createGame({ hostId: 'teacher-9', drill: 'facts', playbook: 'mul', mode: 'drive' });
    expect(g.solo).toBeNull();
    // and a teacher's own limit (three open games) never retires a student's solo game
    expect(G.gamesForHost('teacher-9').map((x) => x.code)).toEqual([g.code]);
  });

  test('swept minutes after it ends, and a lobby nobody started is swept too', () => {
    const done = playSolo({ mode: 'drive', seed: 'sweep' }).game;
    const idle = open({ mode: 'hill' }).game;
    const cls = G.createGame({ hostId: 'teacher-3', drill: 'facts', playbook: 'mul', mode: 'drive' });
    jest.advanceTimersByTime(G.SOLO_TTL_MS + 6 * 60 * 1000);
    expect(G.getGame(done.code)).toBeNull();
    expect(G.getGame(idle.code)).toBeNull();
    expect(G.getGame(cls.code)).toBe(cls); // a class lobby keeps its two hours
  });

  test('never shadowed to Mongo: the store skips a solo game on every path', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../utils/liveDrill/store.js'), 'utf8');
    expect(src).toMatch(/function schedule\(game\) \{[\s\S]{0,260}if \(game\.solo\) return;/);
    expect(src).toMatch(/function forget\(game\) \{\s*if \(game\.solo\) return;/);
    expect(src).toMatch(/games\.filter\(\(g\) => !g\.solo\)\.map\(\(g\) => saveNow\(g\)\)/);
    // and a teacher's list of their own games can never show one
    const { game } = open({ mode: 'drive' });
    expect(G.gamesForHost(game.hostId.replace(/^solo:/, ''))).toEqual([]);
    expect(game.hostId.startsWith('solo:')).toBe(true);
  });
});

describe('what a finished game files', () => {
  test('a signed-in student: one graded row, with the game it was played as and that game\'s own score', () => {
    for (const [mode, scoreOf] of [['drive', (p) => Math.max(0, Math.round(p.yards))], ['hill', (p) => Math.round(p.h)], ['heist', (p) => Math.round(p.cash)]]) {
      const { game, player } = playSolo({ mode, seed: `file${mode}`, userId: '64a000000000000000000001' });
      expect(G.playerView(game, player).solo.saves).toBe(true);
      const row = R.result(game);
      expect(row).toMatchObject({
        userId: '64a000000000000000000001', hub: 'algebra', drill: 'facts', playbook: 'mul', mode, graded: true,
        right: player.comp, attempted: player.att, streak: player.best, score: scoreOf(player),
      });
      expect(row.seconds).toBeGreaterThan(100); expect(row.seconds).toBeLessThanOrEqual(130);
      expect(row.right).toBeLessThanOrEqual(row.attempted);
    }
  });

  test('a guest files nothing; neither does a game nobody answered in, or a class game', () => {
    expect(R.result(playSolo({ mode: 'drive', seed: 'guest' }).game)).toBeNull();
    const idle = open({ mode: 'drive', userId: '64a000000000000000000002' });
    R.begin(idle.game, idle.player); G.endGame(idle.game);
    expect(R.result(idle.game)).toBeNull();
    const cls = G.createGame({ hostId: 't', drill: 'facts', playbook: 'mul', mode: 'drive' });
    G.join(cls, 'Ana', { userId: '64a000000000000000000003' }); G.start(cls); G.endGame(cls);
    expect(R.result(cls)).toBeNull();
  });

  test('Math Facts answers are tracked per fact for the student, as in any game', () => {
    const { player } = playSolo({ mode: 'heist', drill: 'facts', playbook: 'mul', seed: 'facts', userId: '64a000000000000000000004' });
    expect(player.facts.size).toBeGreaterThan(3);
    expect(player.factLog.length).toBe(player.att);
  });
});

describe('the pages', () => {
  const read = (f) => fs.readFileSync(path.join(__dirname, '../../public', f), 'utf8');

  test('the practice page offers every game, and a level, and opens the game on /play', () => {
    const html = read('drill.html'); const js = read('js/live-drill/solo.js');
    expect(html).toMatch(/id="modes"/); expect(html).toMatch(/id="levels"/);
    expect(js).toMatch(/\/api\/live-drill\/play\/solo/);
    expect(js).toMatch(/location\.href = `\/play\?code=/);
    expect(js).toMatch(/'On your own'/); // the classic drill is still the first choice
  });

  test('the game screen lets the student start, deal the next Huddle play, and play again', () => {
    const html = read('play.html'); const js = read('js/live-drill/play.js');
    for (const id of ['l-start', 'l-solo', 'f-again', 'f-levels', 'f-back', 'p-quit']) expect(html).toContain(`id="${id}"`);
    for (const call of ['/begin', '/next', '/again']) expect(js).toContain(`}${call}\``);
    expect(js).toMatch(/st\.solo/);
  });
});
