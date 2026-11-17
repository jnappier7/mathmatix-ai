/**
 * Live drill — Knockout Arena (utils/liveDrill/knockout.js through games.js).
 *
 * What these pin:
 *   - THE CHIPS ARE HONEST: every chip is re-solved here from its own text (`valueOf`), never from
 *     the `val` the bank stamped on it — a right chip makes the target, a wrong one never does,
 *     and no wrong chip reads the same as a right one;
 *   - the open round NEVER tells a screen which chips are right — the answer goes out only once
 *     the round has closed;
 *   - musical chairs: one fewer right chip than cars; a car with none at the close is out, unless
 *     nobody has one; extra chips knock out extra cars; a wrong chip spills every chip held;
 *   - a grab must be plausible: at the chip, and reachable from the car's last report;
 *   - the pit: answers go through the ordinary graded path (so Math Facts are tracked), three in a
 *     row OR six in all buys the way back, the gate closes it, and every right answer scores for
 *     the Fact Champion — fast ones double;
 *   - the game ends at one car; a game survives a snapshot/hydrate mid-round;
 *   - the SIMULATOR: a class of bots always finishes, and a student who knows the facts outlasts
 *     one who drives into the nearest orb.
 */
jest.useFakeTimers();
const G = require('../../utils/liveDrill/games');
const K = require('../../utils/liveDrill/knockout');

afterEach(() => G._reset());

let hostN = 0;
function arena(opts = {}) {
  return G.createGame({ hostId: `k${++hostN}`, drill: 'facts', playbook: 'mul', mode: 'knockout', seconds: 120, secondsPerPlay: 10, ...opts });
}
function seat(g, n) { return Array.from({ length: n }, (_, i) => G.join(g, `P${i}`).player); }
/** Put `p` on a chip (as its device would) and claim it. */
function claim(g, p, chip) {
  const r = g.ko.round;
  const at = K.chipAt(chip, r.world, Date.now());
  Object.assign(p.ko, { x: at.x, y: at.y, posAt: Date.now() });
  return G.grabChip(g, p, { round: r.n, chip: chip.id, x: at.x, y: at.y });
}
const right = (g) => g.ko.round.chips.filter((c) => c.ok && !c.by);
const wrong = (g) => g.ko.round.chips.filter((c) => !c.ok);
/** Answer the pit play `p` is on. */
function pit(g, p, ok = true, ms = 1000) {
  const cur = G.currentPlay(g, p);
  jest.advanceTimersByTime(ms);
  const pl = G.playAt(g, cur.n);
  return G.answer(g, p, cur.n, ok ? pl.answer : String(Number(pl.answer) + 1));
}
const closeNow = (g) => jest.advanceTimersByTime(g.ko.round.closesAt - Date.now() + 250);
const nextRound = () => jest.advanceTimersByTime(K.TUNE.revealMs + 50);

describe('the chips', () => {
  test.each(K.BOOKS)('%s: every chip re-solved from its text — right ones make the target, wrong ones never do', (book) => {
    for (let i = 0; i < 400; i++) {
      const rand = K.rng('seed', `${book}:${i}`);
      const nC = 1 + (i % 30);
      const made = K.makeChips(book, i % 5 === 0 ? [2, 5, 10] : null, rand, nC, 3 + (i % 10));
      expect(made.correct).toHaveLength(nC);
      for (const c of made.correct) expect(K.valueOf(c.text)).toBe(made.target);
      const rightText = new Set(made.correct.map((c) => c.text));
      for (const c of made.wrong) {
        expect(K.valueOf(c.text)).toBe(c.val);
        expect(c.val).not.toBe(made.target);
        expect(rightText.has(c.text)).toBe(false);
      }
      expect(made.wrong.length).toBeGreaterThanOrEqual(2);
      expect(new Set(made.wrong.map((c) => c.text)).size).toBe(made.wrong.length);
    }
  });

  test('every fact stays inside the Math Facts bank: tables to 12, sums and differences to 20', () => {
    for (let v = 0; v <= 144; v++) {
      for (const t of K.FORMS.mul(v)) { const [a, b] = t.split('×').map(Number); expect(a >= 2 && a <= 12 && b >= 2 && b <= 12).toBe(true); }
      for (const t of K.FORMS.add(v)) { const [a, b] = t.split('+').map(Number); expect(a + b).toBeLessThanOrEqual(20); }
      for (const t of K.FORMS.sub(v)) expect(Number(t.split('−')[0])).toBeLessThanOrEqual(20);
      for (const t of K.FORMS.div(v)) expect(Number(t.split('÷')[0])).toBeLessThanOrEqual(144);
    }
  });

  test('a chip drifts on a path that is a pure function of time and never leaves the arena', () => {
    const world = K.worldFor(16);
    const chip = { x: 100, y: 100, vx: 36, vy: -31, t0: 0 };
    for (let t = 0; t < 600000; t += 777) {
      const p = K.chipAt(chip, world, t);
      expect(p.x).toBeGreaterThanOrEqual(K.TUNE.margin); expect(p.x).toBeLessThanOrEqual(world.w - K.TUNE.margin);
      expect(p.y).toBeGreaterThanOrEqual(K.TUNE.margin); expect(p.y).toBeLessThanOrEqual(world.h - K.TUNE.margin);
    }
    expect(K.chipAt(chip, world, 5000)).toEqual(K.chipAt(chip, world, 5000));
  });
});

describe('setup', () => {
  test('plays Math Facts only, and only the books it can build chips for', () => {
    expect(() => arena({ drill: 'geometry', playbook: 'all' })).toThrow(/Math Facts/);
    expect(() => arena({ playbook: 'sq' })).toThrow(/Math Facts/);
    expect(arena({ playbook: 'all' }).mode).toBe('knockout');
  });

  test('one fewer right chip than cars, and the arena grows with the class', () => {
    for (const n of [2, 5, 16, 34]) {
      const g = arena(); seat(g, n); G.start(g);
      expect(g.ko.round.chips.filter((c) => c.ok)).toHaveLength(n - 1);
      expect(g.ko.round.cars).toBe(n);
    }
    expect(K.worldFor(34).w).toBeGreaterThan(K.worldFor(8).w);
  });

  test('the lobby states the rules the server plays', () => {
    const g = arena({ seconds: 180, secondsPerPlay: 15 });
    const r = G.rulesFor(g).knockout;
    expect(r).toMatchObject({ comeback: K.TUNE.comeback, comebackTotal: K.TUNE.comebackTotal, gateSec: 180, roundSec: 15, benchPoints: K.TUNE.benchPoints });
  });
});

describe('what a screen may see', () => {
  test('an open round never says which chips are right; the closed round does', () => {
    const g = arena(); const [a] = seat(g, 4); G.start(g);
    const open = JSON.stringify([G.playerView(g, a).knockout.round, G.hostView(g).knockout.round]);
    expect(open).not.toMatch(/"ok"|"val"|"hits"/);
    closeNow(g);
    const closed = G.playerView(g, a).knockout.round;
    expect(closed.closed).toBe(true);
    expect(closed.chips.every((c) => typeof c.ok === 'boolean' && typeof c.val === 'number')).toBe(true);
  });
});

describe('a round', () => {
  test('a car with a chip survives; a car with none is out; the feed says who', () => {
    const g = arena(); const [a, b, c] = seat(g, 3); G.start(g);
    expect(claim(g, a, right(g)[0])).toMatchObject({ ok: true, held: 1 });
    expect(claim(g, b, right(g)[0])).toMatchObject({ ok: true, held: 1 }); // the last right chip: the round closes
    expect(g.ko.round.closed).toBe(true);
    expect([a.ko.in, b.ko.in, c.ko.in]).toEqual([true, true, false]);
    expect(g.ko.round.out).toEqual(['P2']);
    expect(g.feed[0]).toMatchObject({ type: 'out', count: 1 });
  });

  test('grabbing extra chips knocks out extra cars', () => {
    const g = arena(); const [a, b, c, d] = seat(g, 4); G.start(g);
    claim(g, a, right(g)[0]); claim(g, a, right(g)[0]);
    expect(claim(g, a, right(g)[0])).toMatchObject({ ok: true, held: 3 });
    expect([a.ko.in, b.ko.in, c.ko.in, d.ko.in]).toEqual([true, false, false, false]);
    expect(a.ko.knocked).toBe(2);
  });

  test('first claim wins: the second car is told the chip is taken, and holds nothing', () => {
    const g = arena(); const [a, b] = seat(g, 3); G.start(g);
    const chip = right(g)[0];
    claim(g, a, chip);
    expect(claim(g, b, chip)).toEqual({ taken: true });
    expect(b.ko.held).toHaveLength(0);
  });

  test('a wrong chip slows the car, spills everything it holds, and stings it only once', () => {
    const g = arena(); const [a, b] = seat(g, 4); G.start(g);
    const mine = right(g)[0];
    claim(g, a, mine);
    const bad = wrong(g)[0];
    const r = claim(g, a, bad);
    expect(r).toMatchObject({ ok: false, text: bad.text, val: bad.val, dropped: 1 });
    expect(r.slowUntil).toBe(Date.now() + K.TUNE.slowMs);
    expect(a.ko.held).toHaveLength(0);
    expect(mine.by).toBeNull(); // back on the floor…
    expect(claim(g, b, mine)).toMatchObject({ ok: true }); // …where someone else can take it
    expect(claim(g, a, bad)).toEqual({ again: true });
    expect(bad.hits).toBe(1);
  });

  test('nobody grabbed anything: nobody is out', () => {
    const g = arena(); const cars = seat(g, 3); G.start(g);
    closeNow(g);
    expect(g.ko.round.nobodyOut).toBe(true);
    expect(cars.every((p) => p.ko.in)).toBe(true);
  });

  test('a grab has to be plausible: at the chip, and reachable from the last report', () => {
    const g = arena(); const [a] = seat(g, 3); G.start(g);
    const r = g.ko.round;
    const chip = right(g)[0];
    const at = K.chipAt(chip, r.world, Date.now());
    // claims to be far from the chip
    expect(() => G.grabChip(g, a, { round: r.n, chip: chip.id, x: at.x + 400, y: at.y })).toThrow(/Too far/);
    // claims to be on the chip, having reported the far corner a moment ago
    Object.assign(a.ko, { x: at.x > r.world.w / 2 ? 20 : r.world.w - 20, y: at.y > r.world.h / 2 ? 20 : r.world.h - 20, posAt: Date.now() });
    expect(() => G.grabChip(g, a, { round: r.n, chip: chip.id, x: at.x, y: at.y })).toThrow(/Too far/);
    expect(chip.by).toBeNull();
    expect(() => G.grabChip(g, a, { round: r.n + 1, chip: chip.id, x: at.x, y: at.y })).toThrow(/round is over/);
  });
});

describe('the pit', () => {
  function benched() {
    const g = arena(); const [a, b, c] = seat(g, 3); G.start(g);
    claim(g, a, right(g)[0]); claim(g, b, right(g)[0]); // c is out
    return { g, a, b, c };
  }

  test('only the pit answers plays', () => {
    const { g, a, c } = benched();
    expect(() => G.currentPlay(g, a)).toThrow(/in the arena/);
    expect(G.currentPlay(g, c).play.input).toBe('number');
  });

  test('three right in a row buys the way back; a miss resets the streak but not the total', () => {
    const { g, c } = benched();
    // (quick answers: the reveal is 3 s, and the way back opens at the NEXT round)
    expect(pit(g, c, true, 100).knockout).toMatchObject({ row: 1, since: 1, ready: false });
    expect(pit(g, c, false, 100).knockout).toMatchObject({ row: 0, since: 1, ready: false });
    pit(g, c, true, 100); pit(g, c, true, 100);
    const r = pit(g, c, true, 100).knockout;
    expect(r).toMatchObject({ row: 3, ready: true });
    nextRound();
    expect(c.ko.in).toBe(true);
    expect(c.ko.comebacks).toBe(1);
    expect(g.ko.round.n).toBe(2);
  });

  test('six right in all buys it too — a student who keeps missing one fact is never locked out', () => {
    const { g, c } = benched();
    for (let i = 0; i < 2; i++) { pit(g, c); pit(g, c); pit(g, c, false); } // 4 right, never 3 in a row
    expect(c.ko.ready).toBe(false);
    pit(g, c);
    expect(pit(g, c).knockout).toMatchObject({ since: 6, ready: true });
  });

  test('pit answers are graded Math Facts answers: tracked per fact, like any other game', () => {
    const { g, c } = benched();
    pit(g, c); pit(g, c, false);
    expect(c.att).toBe(2);
    expect(c.comp).toBe(1);
    expect(c.facts.size).toBeGreaterThan(0);
    expect(c.factLog).toHaveLength(2);
  });

  test('every right pit answer scores for Fact Champion, a fluent one double; a ready student keeps scoring', () => {
    const { g, c } = benched();
    expect(pit(g, c, true, 1000).knockout).toMatchObject({ pts: K.TUNE.benchPoints[0], fluent: true });
    expect(pit(g, c, true, 5000).knockout).toMatchObject({ pts: K.TUNE.benchPoints[1], fluent: false });
    expect(pit(g, c, false).knockout.pts).toBe(0);
    pit(g, c); pit(g, c); pit(g, c); // ready
    const before = c.ko.benchPts;
    expect(pit(g, c).knockout.ready).toBe(true);
    expect(c.ko.benchPts).toBe(before + K.TUNE.benchPoints[0]);
    expect(G.hostView(g).knockout.champs[0]).toMatchObject({ name: 'P2', pts: c.ko.benchPts });
  });

  test('after the gate closes there are no comebacks — but the points still count', () => {
    const { g, c } = benched();
    jest.advanceTimersByTime(121000); // rounds roll on; the gate (120 s) closes
    expect(G.playerView(g, c).knockout.gateOpen).toBe(false);
    if (!c.ko.in && g.phase === 'live') {
      const r = pit(g, c).knockout; pit(g, c); pit(g, c);
      expect(r.gateOpen).toBe(false);
      expect(c.ko.ready).toBe(false);
      expect(c.ko.benchPts).toBeGreaterThan(0);
    }
  });

  test('a student who joins after kickoff starts in the pit', () => {
    const { g } = benched();
    const late = G.join(g, 'Late').player;
    expect(late.ko.in).toBe(false);
    expect(G.currentPlay(g, late).play).toBeTruthy();
  });
});

describe('the end', () => {
  test('one car left and nobody on the way back: the game ends and that car is the winner', () => {
    const g = arena(); const [a, b] = seat(g, 2); G.start(g);
    claim(g, a, right(g)[0]);
    expect(g.ko.ending).toBe(true);
    nextRound();
    expect(g.phase).toBe('over');
    const f = G.hostView(g).final.knockout;
    expect(f).toMatchObject({ winner: 'P0', sole: true });
    expect(f.standings.map((p) => p.name)).toEqual(['P0', 'P1']);
    expect(G.playerView(g, b).knockout).toMatchObject({ place: 2, winner: { name: 'P0', me: false } });
  });

  test('one car left but someone has earned the way back: the game goes on', () => {
    const g = arena(); const [a, b, c] = seat(g, 3); G.start(g);
    claim(g, a, right(g)[0]); claim(g, b, right(g)[0]); // round 1: c out
    pit(g, c, true, 100); pit(g, c, true, 100); pit(g, c, true, 100); // c ready before the reveal ends
    nextRound(); // round 2: a, b, c
    expect(g.ko.round.cars).toBe(3);
    claim(g, a, right(g)[0]); claim(g, a, right(g)[0]); // b and c out
    expect(g.ko.ending).toBe(true); // nobody ready this time
    nextRound();
    expect(g.phase).toBe('over');
  });

  test('a game the class walks away from ends by itself', () => {
    const g = arena(); seat(g, 3); G.start(g);
    for (let i = 0; i < K.TUNE.emptyRounds && g.phase === 'live'; i++) { closeNow(g); nextRound(); }
    expect(g.phase).toBe('over');
  });

  test('the fact tracker is on the final screen, and a rematch starts clean', () => {
    const g = arena(); const [a, b] = seat(g, 2); G.start(g);
    claim(g, a, right(g)[0]);
    pit(g, b);
    nextRound();
    expect(G.hostView(g).final.facts.students.some((s) => s.name === 'P1')).toBe(true);
    G.rematch(g);
    expect(g.phase).toBe('lobby');
    expect(a.ko).toMatchObject({ in: true, grabbed: 0 });
    expect(b.ko).toMatchObject({ in: true, benchPts: 0 });
  });
});

describe('a deploy mid-game', () => {
  test('a snapshot revives with the same round, the same chips, and its clock re-armed', () => {
    const g = arena(); const [a, b, c] = seat(g, 3); G.start(g);
    claim(g, a, right(g)[0]);
    const snap = JSON.parse(JSON.stringify(G.snapshot(g)));
    const before = g.ko.round.chips.map((x) => [x.id, x.text, x.ok, x.by]);
    G._reset();
    const h = G.hydrate(snap);
    expect(h.ko.round.chips.map((x) => [x.id, x.text, x.ok, x.by])).toEqual(before);
    const [a2, , c2] = [a, b, c].map((p) => h.players.get(p.id));
    expect(a2.ko.held).toHaveLength(1);
    closeNow(h); // the re-armed clock closes the round
    expect(h.ko.round.closed).toBe(true);
    expect(c2.ko.in).toBe(false);
  });
});

/**
 * The simulator. Bots "drive" by taking time proportional to distance; a KNOWER reads the chips and
 * heads for a right one, a GUESSER drives into whatever is nearest. Pit answers: right with the
 * bot's accuracy. Event-driven on the fake clock.
 */
describe('the simulator', () => {
  function play(seedN, profiles) {
    const g = arena({ seconds: 120, secondsPerPlay: 10 });
    const bots = profiles.map((pr, i) => ({ ...pr, p: G.join(g, `${pr.kind}${i}`).player }));
    let s = seedN * 9973 + 1;
    const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    G.start(g);
    let guard = 0;
    while (g.phase === 'live' && guard++ < 4000) {
      const r = g.ko.round;
      if (!r.closed) {
        for (const b of bots) {
          if (!b.p.ko.in) { // the pit: one answer a tick
            const cur = G.currentPlay(g, b.p); const pl = G.playAt(g, cur.n);
            G.answer(g, b.p, cur.n, rnd() < b.acc ? pl.answer : String(Number(pl.answer) + 1));
            continue;
          }
          if (b.p.ko.held.length >= b.greed || rnd() > b.pace || b.p.ko.slowUntil > Date.now()) continue;
          const open = r.chips.filter((c) => !c.by && !b.p.ko.ate.includes(c.id));
          const pool = b.kind === 'knower' && rnd() < b.acc ? open.filter((c) => c.ok) : open;
          if (!pool.length) continue;
          claim(g, b.p, pool[Math.floor(rnd() * pool.length)]);
          if (r.closed) break;
        }
      }
      jest.advanceTimersByTime(1500);
    }
    return { g, bots };
  }

  test('a class of 16 always finishes, with one winner, inside the cap', () => {
    for (let i = 0; i < 12; i++) {
      const profiles = Array.from({ length: 16 }, (_, j) => ({ kind: 'knower', acc: 0.6 + (j % 5) * 0.08, pace: 0.5, greed: 1 + (j % 3) }));
      const { g } = play(i, profiles);
      expect(g.phase).toBe('over');
      expect(g.endedAt - g.startedAt).toBeLessThanOrEqual(120000 + K.TUNE.capMs + 20000);
      expect(G.hostView(g).final.knockout.winner).toBeTruthy();
    }
  });

  test('knowing the facts beats driving into the nearest orb', () => {
    let knower = 0; let guesser = 0;
    for (let i = 0; i < 40; i++) {
      const profiles = Array.from({ length: 12 }, (_, j) => (j % 2 ? { kind: 'knower', acc: 0.9, pace: 0.5, greed: 1 } : { kind: 'guesser', acc: 0.5, pace: 0.9, greed: 1 }));
      const { g } = play(100 + i, profiles);
      const w = G.hostView(g).final.knockout.winner;
      if (/^knower/.test(w)) knower++; else guesser++;
    }
    // the guesser acts nearly twice as often; it should still lose most games
    expect(knower).toBeGreaterThan(guesser * 2);
  });
});
