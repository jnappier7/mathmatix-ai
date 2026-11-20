/**
 * Live drill — Knockout Arena (utils/liveDrill/knockout.js through games.js).
 *
 * What these pin:
 *   - THE CHIPS ARE HONEST: every chip is re-solved here from its own text (`valueOf`), never from
 *     the `val` the bank stamped on it — a right chip makes the target, a wrong one never does,
 *     and no wrong chip reads the same as a right one;
 *   - the open round NEVER tells a screen which chips are right — the answer goes out only once
 *     the round has closed;
 *   - musical chairs: one fewer right chip than cars, ONE orb each, and EXACTLY ONE car out a round —
 *     the one left without, or (clock ran out on several) the empty-handed car with the fewest
 *     points; nobody has one, nobody is out;
 *   - the scoreboard: a right orb pays more the sooner it is found; a wrong one slows and costs;
 *   - a grab must be plausible: at the chip, and reachable from the car's last report;
 *   - the pit: answers go through the ordinary graded path (so Math Facts are tracked), three in a
 *     row OR eight in all buys the way back, the gate closes it, and every right answer scores for
 *     the Fact Champion — fast ones double;
 *   - the game ends at one car; a game survives a snapshot/hydrate mid-round;
 *   - the SIMULATOR: a class of bots always finishes, and a student who knows the facts outlasts
 *     one who drives into the nearest orb;
 *   - POWER-UPS: gold orbs (+100, +50, ⚡) pop in mid-round — hidden from every screen until then —
 *     first claim wins, points land on the scoreboard, a full tank leaves a ⚡ on the floor, a
 *     charge is spent once, and going out loses them;
 *   - BUMPER CARS (public/js/live-drill/knockout.js, which every device runs): two devices bounce
 *     their cars apart as mirror images, a bump is always felt, and no bounce is ever faster than
 *     the server's grab check allows — a car that was just bumped can still grab an orb;
 *   - THE WHOLE ARENA on every screen: it fits, and a portrait phone turns it to draw it bigger.
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

  test('no round opens with an orb on a car: every car has to drive to its orb', () => {
    for (const n of [2, 8, 16, 26, 34]) {
      for (const seed of ['a', 'b', 'c']) {
        const g = arena(); seat(g, n); g.seed = `${seed}${n}`; G.start(g);
        const { chips, world } = g.ko.round;
        let nearest = Infinity;
        for (const p of g.players.values()) {
          for (const c of chips) nearest = Math.min(nearest, Math.hypot(c.x - p.ko.x, c.y - p.ko.y));
        }
        // the clearance holds in every class size we play; never inside an orb's reach plus a car length
        expect(nearest).toBeGreaterThan(K.TUNE.eatDist + K.TUNE.chipR);
        if (n <= 26) expect(nearest).toBeGreaterThanOrEqual(K.TUNE.carClear * 0.9);
        for (const c of chips) {
          expect(c.x).toBeGreaterThanOrEqual(K.TUNE.margin); expect(c.x).toBeLessThanOrEqual(world.w - K.TUNE.margin);
        }
      }
    }
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

  test('one orb each: a car that has its orb is safe, and nothing else it touches counts', () => {
    const g = arena(); const [a, b, c, d] = seat(g, 4); G.start(g);
    expect(claim(g, a, right(g)[0])).toMatchObject({ ok: true, held: 1 });
    const second = right(g)[0];
    expect(claim(g, a, second)).toEqual({ safe: true, held: 1 }); // a second right orb stays on the floor
    expect(second.by).toBeNull();
    const bad = wrong(g)[0];
    expect(claim(g, a, bad)).toEqual({ safe: true, held: 1 }); // and a wrong one cannot sting a safe car
    expect(bad.hits).toBe(0);
    expect(a.ko.wrong).toBe(0);
    claim(g, b, right(g)[0]); claim(g, c, right(g)[0]); // the last right orb: the round closes
    expect([a.ko.in, b.ko.in, c.ko.in, d.ko.in]).toEqual([true, true, true, false]);
    expect(G.rulesFor(g).knockout.maxHold).toBe(1);
  });

  test('exactly one car goes out a round, whatever the class does', () => {
    for (const n of [3, 8, 16, 31]) {
      const g = arena(); const cars = seat(g, n); G.start(g);
      // only a third of the class finds an orb before the clock runs out
      for (const p of cars.slice(0, Math.ceil(n / 3))) claim(g, p, right(g)[0]);
      closeNow(g);
      expect(cars.filter((p) => !p.ko.in)).toHaveLength(1);
      expect(g.ko.round.out).toHaveLength(1);
      expect(g.ko.round.spared).toHaveLength(n - Math.ceil(n / 3) - 1);
    }
  });

  test('the clock runs out on several empty-handed cars: the one with the fewest points goes', () => {
    const g = arena(); const [a, b, c, d] = seat(g, 4); G.start(g);
    Object.assign(b.ko, { pts: 300 }); Object.assign(c.ko, { pts: 120 }); Object.assign(d.ko, { pts: 200 });
    claim(g, a, right(g)[0]);
    closeNow(g);
    expect([a.ko.in, b.ko.in, c.ko.in, d.ko.in]).toEqual([true, true, false, true]);
    expect(G.hostView(g).knockout.round).toMatchObject({ out: ['P2'], spared: ['P3', 'P1'] }); // spared, fewest points first
  });

  test('…and on a tie in points, the one who hit more wrong orbs this round', () => {
    const g = arena(); const [a, b, c] = seat(g, 3); G.start(g);
    claim(g, c, wrong(g)[0]);
    claim(g, a, right(g)[0]);
    closeNow(g);
    expect([b.ko.in, c.ko.in]).toEqual([true, false]);
  });

  test('sooner scores more: the same orb pays less the later it is found', () => {
    const g = arena({ secondsPerPlay: 10 }); const [a, b, c] = seat(g, 4); G.start(g);
    const first = claim(g, a, right(g)[0]);
    expect(first).toMatchObject({ pts: K.TUNE.points.max, total: K.TUNE.points.max, first: true });
    jest.advanceTimersByTime(5000);
    const mid = claim(g, b, right(g)[0]);
    expect(mid).toMatchObject({ pts: (K.TUNE.points.max + K.TUNE.points.min) / 2, first: false });
    jest.advanceTimersByTime(4900);
    const late = claim(g, c, right(g)[0]);
    expect(late.pts).toBeGreaterThanOrEqual(K.TUNE.points.min);
    expect(late.pts).toBeLessThan(mid.pts);
    // the scoreboard every screen is sent
    expect(G.hostView(g).knockout.scores.slice(0, 3).map((x) => x.name)).toEqual(['P0', 'P1', 'P2']);
    expect(G.playerView(g, b).knockout).toMatchObject({ pts: mid.pts, rank: 2 });
    expect(G.rulesFor(g).knockout.points).toEqual(K.TUNE.points);
  });

  test('first claim wins: the second car is told the chip is taken, and holds nothing', () => {
    const g = arena(); const [a, b] = seat(g, 3); G.start(g);
    const chip = right(g)[0];
    claim(g, a, chip);
    expect(claim(g, b, chip)).toEqual({ taken: true });
    expect(b.ko.held).toHaveLength(0);
  });

  test('a wrong chip slows the car, costs points (never below zero), and stings it only once', () => {
    const g = arena(); const [a, b] = seat(g, 4); G.start(g);
    const [bad, bad2] = wrong(g);
    const r = claim(g, a, bad);
    expect(r).toMatchObject({ ok: false, text: bad.text, val: bad.val, cost: 0, total: 0 }); // nothing to lose yet
    expect(r.slowUntil).toBe(Date.now() + K.TUNE.slowMs);
    expect(claim(g, a, bad)).toEqual({ again: true });
    expect(bad.hits).toBe(1);
    b.ko.pts = 55;
    expect(claim(g, b, bad2)).toMatchObject({ ok: false, cost: K.TUNE.wrongCost, total: 55 - K.TUNE.wrongCost });
    // a stung car can still take its orb
    expect(claim(g, a, right(g)[0])).toMatchObject({ ok: true, held: 1 });
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

  test('four right in a row buys the way back; a miss resets the streak but not the total', () => {
    const { g, c } = benched();
    // (quick answers: the reveal is 3 s, and the way back opens at the NEXT round)
    expect(pit(g, c, true, 100).knockout).toMatchObject({ row: 1, since: 1, ready: false });
    expect(pit(g, c, false, 100).knockout).toMatchObject({ row: 0, since: 1, ready: false });
    pit(g, c, true, 100); pit(g, c, true, 100);
    expect(pit(g, c, true, 100).knockout).toMatchObject({ row: 3, ready: false });
    const r = pit(g, c, true, 100).knockout;
    expect(r).toMatchObject({ row: 4, ready: true });
    nextRound();
    expect(c.ko.in).toBe(true);
    expect(c.ko.comebacks).toBe(1);
    expect(g.ko.round.n).toBe(2);
  });

  test('eight right in all buys it too — a student who keeps missing one fact is never locked out', () => {
    const { g, c } = benched();
    for (let i = 0; i < 3; i++) { pit(g, c); pit(g, c); pit(g, c, false); } // 6 right, never 4 in a row
    expect(c.ko.ready).toBe(false);
    pit(g, c);
    expect(pit(g, c).knockout).toMatchObject({ since: 8, ready: true });
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
    pit(g, c); pit(g, c); pit(g, c); pit(g, c); // ready
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
    pit(g, c, true, 100); pit(g, c, true, 100); pit(g, c, true, 100); pit(g, c, true, 100); // c ready before the reveal ends
    nextRound(); // round 2: a, b, c
    expect(g.ko.round.cars).toBe(3);
    claim(g, a, right(g)[0]); claim(g, b, right(g)[0]); // c out again, nobody on the way back
    expect(g.ko.ending).toBe(false); // two cars still running
    nextRound(); // round 3: a, b
    claim(g, a, right(g)[0]); // b out: one car left
    expect(g.ko.ending).toBe(true);
    nextRound();
    expect(g.phase).toBe('over');
    expect(G.hostView(g).final.knockout).toMatchObject({ winner: 'P0', sole: true, rounds: 3 });
  });

  test('sudden death takes one car a round, so it is given a round per car — and then it is called', () => {
    const g = arena({ seconds: 30 }); const cars = seat(g, 5); G.start(g);
    jest.advanceTimersByTime(31000); // the gate closes
    // every round from here, only P0 finds an orb: one car out a round until P0 is alone
    for (let i = 0; i < 12 && g.phase === 'live'; i++) {
      if (g.ko.round.closed) nextRound();
      if (g.phase !== 'live') break;
      if (cars[0].ko.in && !cars[0].ko.held.length) claim(g, cars[0], right(g)[0]);
      closeNow(g);
    }
    nextRound();
    expect(g.phase).toBe('over');
    expect(G.hostView(g).final.knockout.winner).toBe('P0');
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
    expect(a2.ko.in).toBe(true);
    expect([b, c].map((p) => h.players.get(p.id).ko.in).filter((x) => !x)).toHaveLength(1); // one of the two empty-handed cars
    void c2;
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

  test('a class of 16 always finishes, with one winner, and takes a round per car to get there', () => {
    for (let i = 0; i < 12; i++) {
      const profiles = Array.from({ length: 16 }, (_, j) => ({ kind: 'knower', acc: 0.6 + (j % 5) * 0.08, pace: 0.5, greed: 1 + (j % 3) }));
      const { g } = play(i, profiles);
      expect(g.phase).toBe('over');
      // one car a round: a class of 16 needs at least 15 rounds, and sudden death is capped near one per car
      expect(g.ko.rounds).toBeGreaterThanOrEqual(15);
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

describe('power-ups', () => {
  /** Wait until power-up `p` has popped in, put `car` on it (as its device would) and claim it. */
  function take(g, car, p) {
    if (Date.now() < p.at) jest.advanceTimersByTime(p.at - Date.now() + 1);
    const at = K.chipAt(p, g.ko.round.world, Date.now());
    Object.assign(car.ko, { x: at.x, y: at.y, posAt: Date.now() });
    return G.grabChip(g, car, { round: g.ko.round.n, power: p.id, x: at.x, y: at.y });
  }
  const kindOf = (g, kind) => {
    // find a round with a power-up of this kind (seeds decide), returning [game, power-up, cars]
    for (let i = 0; i < 60; i++) {
      const gg = arena({ secondsPerPlay: 20 }); const cars = seat(gg, 6); gg.seed = `pow${kind}${i}`; G.start(gg);
      const p = gg.ko.round.powerups.find((x) => x.kind === kind);
      if (p) return [gg, p, cars];
      G._reset();
    }
    throw new Error(`no ${kind} power-up in 60 seeds`);
  };

  test('every round deals one per three cars (at least two), each popping in at its own moment inside the round', () => {
    for (const n of [2, 6, 13, 24, 34]) {
      const g = arena({ secondsPerPlay: 20 }); seat(g, n); G.start(g);
      const { powerups, openedAt, closesAt, world } = g.ko.round;
      expect(powerups).toHaveLength(Math.max(K.TUNE.power.min, Math.round(n / K.TUNE.power.per)));
      for (const p of powerups) {
        expect(Object.keys(K.TUNE.power.kinds)).toContain(p.kind);
        expect(p.at).toBeGreaterThanOrEqual(openedAt + K.TUNE.power.from * (closesAt - openedAt) - 1);
        expect(p.at).toBeLessThanOrEqual(openedAt + K.TUNE.power.to * (closesAt - openedAt) + 1);
        expect(p.until).toBeLessThanOrEqual(closesAt);
        expect(p.until - p.at).toBeLessThanOrEqual(K.TUNE.power.life);
        for (const dt of [0, 3000, 7000]) {
          const q = K.chipAt(p, world, p.at + dt);
          expect(q.x).toBeGreaterThanOrEqual(K.TUNE.margin); expect(q.x).toBeLessThanOrEqual(world.w - K.TUNE.margin);
        }
      }
    }
  });

  test('a power-up pops in clear of where every fact orb is at that moment', () => {
    for (const n of [6, 16, 30]) {
      for (const seed of ['a', 'b', 'c', 'd']) {
        const g = arena({ secondsPerPlay: 20 }); seat(g, n); g.seed = `clear${seed}${n}`; G.start(g);
        const { powerups, chips, world } = g.ko.round;
        for (const p of powerups) {
          const nearest = Math.min(...chips.map((c) => { const q = K.chipAt(c, world, p.at); return Math.hypot(q.x - p.x, q.y - p.y); }));
          expect(nearest).toBeGreaterThan(K.TUNE.chipR); // never inside an orb, even in a crowded arena
          if (n <= 16) expect(nearest).toBeGreaterThan(K.TUNE.chipR + K.TUNE.power.r); // and clear of it, with room
        }
      }
    }
  });

  test('more boosts (owner, after the first class games): a class of 25 sees several power-ups a round, most of them boosts', () => {
    const n = { speed: 0, all: 0 };
    for (let i = 0; i < 200; i++) for (const p of K.dealPowerups(25, K.worldFor(25), K.rng(`boosts${i}`, 1), 1, 0, 20000)) { n.all++; if (p.kind === 'speed') n.speed++; }
    expect(n.all / 200).toBeGreaterThanOrEqual(8); // one per three cars
    expect(n.speed / n.all).toBeGreaterThan(0.55);
    expect(n.speed / 200).toBeGreaterThanOrEqual(5); // ~5 boosts a round (was ~1)
  });

  test('over many rounds every kind turns up, the point ones less often than speed', () => {
    const n = { speed: 0, pts50: 0, pts100: 0 };
    for (let i = 0; i < 400; i++) for (const p of K.dealPowerups(12, K.worldFor(12), K.rng(`odds${i}`, 1), 1, 0, 20000)) n[p.kind]++;
    expect(n.pts100).toBeGreaterThan(0);
    expect(n.speed).toBeGreaterThan(n.pts50);
    expect(n.pts50).toBeGreaterThan(n.pts100);
  });

  test('no screen is told about a power-up before it pops in — and the moment it does, every screen is', () => {
    const g = arena({ secondsPerPlay: 20 }); const [a] = seat(g, 6); G.start(g);
    const p = g.ko.round.powerups[0];
    const updates = [];
    G.subscribe(g, { res: { write: (s) => updates.push(s), end() {} }, kind: 'host' });
    expect(G.playerView(g, a).knockout.round.powerups).toEqual([]);
    expect(G.hostView(g).knockout.round.powerups).toEqual([]);
    expect(() => G.grabChip(g, a, { round: g.ko.round.n, power: p.id, x: p.x, y: p.y })).toThrow(/gone/);
    const before = updates.length;
    jest.advanceTimersByTime(p.at - Date.now() + 1100); // (state pushes are coalesced: give it a beat)
    expect(updates.length).toBeGreaterThan(before);
    expect(G.playerView(g, a).knockout.round.powerups.map((x) => x.id)).toContain(p.id);
    expect(G.playerView(g, a).knockout.round.powerups.find((x) => x.id === p.id)).toMatchObject({ kind: p.kind, taken: 0, until: p.until });
  });

  test('a point power-up goes straight onto the scoreboard; first claim wins, and every screen is told who', () => {
    const [g, p, [a, b]] = kindOf(null, 'pts100');
    const before = a.ko.pts;
    expect(take(g, a, p)).toMatchObject({ power: 'pts100', pts: 100, total: before + 100 });
    expect(take(g, b, p)).toEqual({ taken: true });
    expect(a.ko).toMatchObject({ pts: before + 100, bonus: 100, powers: 1 });
    expect(G.hostView(g).knockout.round.powerups.find((x) => x.id === p.id)).toMatchObject({ taken: 1, by: a.name });
  });

  test('a speed power-up is a charge; a full tank leaves it for someone else', () => {
    const [g, p, [a, b]] = kindOf(null, 'speed');
    a.ko.boosts = K.TUNE.boost.max;
    expect(take(g, a, p)).toEqual({ full: true, boosts: K.TUNE.boost.max });
    expect(p.by).toBeNull();
    expect(take(g, b, p)).toMatchObject({ power: 'speed', boosts: 1, pts: 0 });
    expect(b.ko.boosts).toBe(1);
  });

  test('a power-up has to be grabbed while it is there, and plausibly', () => {
    const [g, p, [a]] = kindOf(null, 'pts50');
    jest.advanceTimersByTime(p.at - Date.now() + 1);
    const at = K.chipAt(p, g.ko.round.world, Date.now());
    Object.assign(a.ko, { x: at.x > 600 ? 20 : 1180, y: at.y > 380 ? 20 : 740, posAt: Date.now() });
    expect(() => G.grabChip(g, a, { round: g.ko.round.n, power: p.id, x: at.x, y: at.y })).toThrow(/Too far from that power-up/);
    jest.advanceTimersByTime(p.until - Date.now() + 1);
    if (!g.ko.round.closed) expect(() => take(g, a, p)).toThrow(/gone/);
    expect(p.by).toBeNull();
  });

  test('a charge is spent once: it starts the boost clock, the frame shows it, and an empty tank is refused', () => {
    const g = arena(); const [a] = seat(g, 6); G.start(g);
    a.ko.boosts = 1;
    const r = G.fireBoost(g, a, { x: a.ko.x, y: a.ko.y, vx: 90, vy: 0 });
    expect(r).toEqual({ boosts: 0, boostUntil: Date.now() + K.TUNE.boost.ms });
    expect(K.carFrame(g, Date.now()).find((f) => f[0] === a.id)).toEqual([a.id, a.ko.x, a.ko.y, 0, 90, 0, 1]);
    expect(() => G.fireBoost(g, a, {})).toThrow(/No boost left/);
    jest.advanceTimersByTime(K.TUNE.boost.ms + 10);
    expect(K.carFrame(g, Date.now()).find((f) => f[0] === a.id)[6]).toBe(0);
  });

  test('a car that goes out loses its charges, and a car in the pit cannot boost', () => {
    const g = arena(); const cars = seat(g, 3); G.start(g);
    const [a, b, c] = cars;
    c.ko.boosts = 2;
    claim(g, a, right(g)[0]); claim(g, b, right(g)[0]); // c is left without
    expect(c.ko.in).toBe(false);
    expect(c.ko.boosts).toBe(0);
    expect(() => G.fireBoost(g, c, {})).toThrow(/not in the arena/);
  });

  test('a report carries the car\'s speed, never above the top speed; the lobby states the power-up rules', () => {
    const g = arena(); const [a] = seat(g, 4); G.start(g);
    G.reportPosition(g, a, 100, 200, { vx: 3000, vy: 0 });
    expect(a.ko).toMatchObject({ x: 100, y: 200, vx: K.TUNE.speed * K.TUNE.topMult, vy: 0 });
    G.reportPosition(g, a, 110, 200, { vx: 'fast' }); // junk speed: the position still lands, the speed stays
    expect(a.ko).toMatchObject({ x: 110, vx: K.TUNE.speed * K.TUNE.topMult });
    expect(G.rulesFor(g).knockout).toMatchObject({ boostMax: K.TUNE.boost.max, boostSec: K.TUNE.boost.ms / 1000, powerPts: [100, 50], powerSec: K.TUNE.power.life / 1000, ghostSafe: true });
    expect(G.playerView(g, a).knockout.tune).toMatchObject({ boost: K.TUNE.boost, bump: K.TUNE.bump, topMult: K.TUNE.topMult, power: { pts: K.TUNE.power.pts } });
  });

  test('power-ups survive a deploy: the same ones, the same claims, and the pop-ins re-armed', () => {
    const [g, p, [a]] = kindOf(null, 'pts50');
    take(g, a, p);
    const snap = JSON.parse(JSON.stringify(G.snapshot(g)));
    const before = g.ko.round.powerups.map((x) => [x.id, x.kind, x.at, x.by]);
    G._reset();
    const h = G.hydrate(snap);
    expect(h.ko.round.powerups.map((x) => [x.id, x.kind, x.at, x.by])).toEqual(before);
    expect(h.players.get(a.id).ko).toMatchObject({ bonus: 50, powers: 1 });
  });

  test('the final screen counts each driver\'s power-ups and names the top hunter', () => {
    const [g, p, [a]] = kindOf(null, 'pts100');
    take(g, a, p);
    G.endGame(g);
    const f = G.hostView(g).final.knockout;
    expect(f.standings.find((x) => x.name === a.name)).toMatchObject({ powers: 1, bonus: 100 });
    expect(f.awards.powers).toEqual({ name: a.name, n: 1 });
  });
});

describe('bumper cars (the bounce every device runs)', () => {
  const C = require('../../public/js/live-drill/knockout.js');
  const B = K.TUNE.bump;
  const TOP = K.TUNE.speed * K.TUNE.topMult * 0.95; // what the page caps a bounce at
  const car = (x, y, vx = 0, vy = 0) => ({ x, y, vx, vy });

  test('two cars apart do not touch; two that overlap are pushed exactly apart', () => {
    expect(C.bumpOff(car(0, 0), car(B.r * 2 + 1, 0), B, TOP)).toBeNull();
    const a = car(0, 0, 100, 0);
    expect(C.bumpOff(a, car(B.r, 0, -100, 0), B, TOP)).toEqual({ nx: -1, ny: 0 });
    expect(Math.abs(a.x - B.r)).toBeCloseTo(B.r * 2, 6);
  });

  test('head on: each device bounces its own car, and the two results are mirror images', () => {
    // A's device: A at 0 moving right at 120, sees B at 30 moving left at 120
    const a = car(0, 0, 120, 0); C.bumpOff(a, car(30, 0, -120, 0), B, TOP);
    // B's device: the same moment, from the other side
    const b = car(30, 0, -120, 0); C.bumpOff(b, car(0, 0, 120, 0), B, TOP);
    expect(a.vx).toBeLessThan(0); expect(b.vx).toBeGreaterThan(0);
    expect(a.vx).toBeCloseTo(-b.vx, 6);
    expect(a.x - 15).toBeCloseTo(-(b.x - 15), 6);
    // equal masses: the closing speed comes back (times e), never more
    expect(Math.abs(a.vx)).toBeCloseTo(Math.max(B.kick, 120 * B.e), 6);
  });

  test('a car at rest that is hit is always knocked away at least at the kick speed', () => {
    const still = car(0, 0); C.bumpOff(still, car(-20, 0, 60, 0), B, TOP);
    expect(still.vx).toBeGreaterThanOrEqual(B.kick - 1e-9);
    expect(still.vy).toBeCloseTo(0, 9);
  });

  test('no bounce is ever faster than the grab check allows — so a car that was just bumped can still grab', () => {
    for (let i = 0; i < 400; i++) {
      const a = car(0, 0, (Math.random() - 0.5) * 900, (Math.random() - 0.5) * 900);
      const o = car((Math.random() - 0.5) * B.r * 3.9, (Math.random() - 0.5) * B.r * 3.9, (Math.random() - 0.5) * 900, (Math.random() - 0.5) * 900);
      if (!C.bumpOff(a, o, B, TOP)) continue;
      expect(Math.hypot(a.vx, a.vy)).toBeLessThanOrEqual(TOP + 1e-6);
    }
    // the server's side: a car reports, is bounced away at the top speed for half a second, then grabs
    const g = arena(); const [p] = seat(g, 3); G.start(g);
    const chip = right(g)[0];
    const t0 = Date.now();
    jest.advanceTimersByTime(500);
    const at = K.chipAt(chip, g.ko.round.world, Date.now());
    const back = (TOP * 0.5) + K.TUNE.eatDist; // where it was half a second before, at full bounce speed
    Object.assign(p.ko, { x: at.x - back, y: at.y, posAt: t0 });
    expect(G.grabChip(g, p, { round: g.ko.round.n, chip: chip.id, x: at.x, y: at.y })).toMatchObject({ ok: true });
  });

  test('a device draws the same orb paths the server checks grabs against', () => {
    const g = arena(); seat(g, 8); G.start(g);
    const r = g.ko.round;
    for (const c of r.chips) {
      for (const dt of [0, 1700, 9000, 61000]) {
        expect(C.chipAt(c, r.world, c.t0 + dt, K.TUNE.margin)).toEqual(K.chipAt(c, r.world, c.t0 + dt));
      }
    }
  });
});

describe('the whole arena, on every screen', () => {
  const C = require('../../public/js/live-drill/knockout.js');
  const fits = (v, cw, ch, world) => {
    const w = (v.rot ? world.h : world.w) * v.s; const h = (v.rot ? world.w : world.h) * v.s;
    return v.cx - w / 2 >= -1e-6 && v.cx + w / 2 <= cw + 1e-6 && v.cy - h / 2 >= -1e-6 && v.cy + h / 2 <= ch + 1e-6;
  };

  test('every class size fits on a phone, a Chromebook and a projector — nothing is off the screen', () => {
    for (const n of [2, 16, 30, 40]) {
      const world = K.worldFor(n);
      for (const [cw, ch, turn] of [[390, 750, true], [360, 640, true], [750, 390, true], [1366, 600, true], [1880, 820, false]]) {
        const v = C.fitView(cw, ch, world, { top: turn ? 110 : 0, bottom: turn ? 70 : 0, canTurn: turn });
        expect(fits(v, cw, ch - (turn ? 70 : 0), world)).toBe(true);
      }
    }
  });

  test('a portrait phone turns the arena, which draws it half again as big; a landscape screen never turns it', () => {
    const world = K.worldFor(25);
    const flat = C.fitView(390, 750, world, { top: 110, bottom: 70 });
    const turned = C.fitView(390, 750, world, { top: 110, bottom: 70, canTurn: true });
    expect(turned.rot).toBeCloseTo(Math.PI / 2, 9);
    expect(turned.s / flat.s).toBeGreaterThan(1.4);
    expect(C.fitView(1366, 600, world, { top: 110, canTurn: true }).rot).toBe(0);
    expect(C.fitView(1880, 820, world, { pad: 0 }).rot).toBe(0); // the projector is never offered a turn
  });

  test('on a turned arena a drag still goes where the finger goes', () => {
    const rot = Math.PI / 2;
    // the canvas draws arena (x, y) at screen rotate(rot)(x, y); steering must land the car under the finger
    const toScreen = ({ dx, dy }) => ({ dx: dx * Math.cos(rot) - dy * Math.sin(rot), dy: dx * Math.sin(rot) + dy * Math.cos(rot) });
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1], [0.6, -0.8]]) {
      const back = toScreen(C.screenToWorld(dx, dy, rot));
      expect(back.dx).toBeCloseTo(dx, 9); expect(back.dy).toBeCloseTo(dy, 9);
    }
    expect(C.screenToWorld(0.3, -0.7, 0)).toEqual({ dx: 0.3, dy: -0.7 });
  });
});

describe('lag (owner, 2026-11-19: "students had issues with lagging")', () => {
  const fs = require('fs');
  const path = require('path');
  const page = fs.readFileSync(path.join(__dirname, '../../public/js/live-drill/knockout.js'), 'utf8');

  test('nothing is blurred per frame: every shadowBlur draws into a cache, never onto the live canvas', () => {
    // A throttled phone with 26 cars ran at 16 fps with per-frame canvas blur and 50+ without it.
    const blurs = page.split('\n').filter((l) => /shadowBlur\s*=\s*[^0]/.test(l));
    expect(blurs.length).toBeGreaterThan(0);
    for (const l of blurs) expect(l).toMatch(/\bg\.shadowBlur/); // `g` is a cache canvas (arenaLayer, sprite), `ctx` the live one
    expect(page).not.toMatch(/\bctx\.shadowBlur\s*=\s*[^0]/);
  });

  test('the floor is drawn once per layout, the canvas is measured on resize only, and a slow device draws at a lower resolution', () => {
    expect(page).toMatch(/function arenaLayer\(W, H\)[\s\S]*arenaCache && arenaCache\.key === key\) return/);
    expect(page).toMatch(/new ResizeObserver/);
    expect(page).toMatch(/function governor\(dtMs\)[\s\S]*dprCap = Math\.max\(1, dprCap - 0\.5\)/);
  });

  test('a successful position report is not logged (a class of 25 sends ~75 a second); a failed one is', () => {
    const log = require('../../utils/logger');
    expect(log.isQuietRequest('/api/live-drill/play/ABC123/pos', 204)).toBe(true);
    expect(log.isQuietRequest('/api/live-drill/play/ABC123/pos', 429)).toBe(false);
    expect(log.isQuietRequest('/api/live-drill/play/ABC123/grab', 200)).toBe(false);
  });
});
