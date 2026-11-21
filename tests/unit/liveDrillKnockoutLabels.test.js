/**
 * Live drill — Knockout Arena with other content: LABEL ROUNDS (utils/liveDrill/knockout.js).
 *
 * Owner, 2026-11-20: "Can Knockout arena handle other content from my courses … Little ASA and SSS
 * SAS HL orbs and a space for a diagram", then "maybe a little built in think time for each new
 * question." A drill whose every play has the same short answers (DRILLS[*].arena === 'labels':
 * Triangle Congruence) plays the arena with the question and the orbs swapped round: every car
 * gets its OWN diagram, and the orbs carry the answers.
 *
 * What these pin:
 *   - EVERY CAR ITS OWN QUESTION, a pure function of (seed, player, round) — so one student cannot
 *     call the answer across the room, and a deploy mid-round deals the same ones again;
 *   - THE ORBS ARE HONEST: the orb the server accepts for a car is the bank's graded answer to that
 *     car's very play (tests/unit/liveDrillCongruence.test.js re-derives every such answer from the
 *     marks in the picture), in the orb's short form;
 *   - there is an orb for every car's answer, and at least one of every label, so a student has to
 *     tell their label from the others;
 *   - THINK TIME: nothing can be grabbed before `goAt`, the orbs hold still until then, and the
 *     points clock starts there — reading the diagram is never on the clock;
 *   - an open round never tells a screen its answer (not the car's own, not anyone's);
 *   - an orb is right for one car and wrong for another; a wrong one stings and is not used up;
 *   - one orb each, and the round closes when all but one car is safe: exactly one car out a round;
 *   - the projector's "one to look at" and the final table of which answers gave trouble;
 *   - the SIMULATOR: a class always finishes, and reading the diagram beats driving into the
 *     nearest orb.
 */
jest.useFakeTimers();
const G = require('../../utils/liveDrill/games');
const K = require('../../utils/liveDrill/knockout');
const { DRILLS, dealPlay } = require('../../utils/liveDrill/engine');
const CONG = require('../../utils/liveDrill/fluency/congruence');

afterEach(() => G._reset());

let hostN = 0;
function arena(opts = {}) {
  return G.createGame({ hostId: `kl${++hostN}`, drill: 'congruence', playbook: 'all', mode: 'knockout', seconds: 120, secondsPerPlay: 15, ...opts });
}
function seat(g, n) { return Array.from({ length: n }, (_, i) => G.join(g, `P${i}`).player); }
const go = (g) => jest.advanceTimersByTime(Math.max(0, g.ko.round.goAt - Date.now()));
function claim(g, p, chip) {
  const r = g.ko.round;
  const at = K.chipAt(chip, r.world, Date.now());
  Object.assign(p.ko, { x: at.x, y: at.y, posAt: Date.now() });
  return G.grabChip(g, p, { round: r.n, chip: chip.id, x: at.x, y: at.y });
}
const need = (g, p) => K.questionFor(g, p, g.ko.round.n).label;
const own = (g, p) => g.ko.round.chips.find((c) => c.text === need(g, p) && !c.by);
const other = (g, p) => g.ko.round.chips.find((c) => c.text !== need(g, p) && !p.ko.ate.includes(c.id));
const closeNow = (g) => jest.advanceTimersByTime(g.ko.round.closesAt - Date.now() + 250);
const nextRound = () => jest.advanceTimersByTime(K.TUNE.revealMs + 50);

describe('which drills the arena plays', () => {
  test('Math Facts, or a drill whose answers are a fixed set of short labels — never a course drill', () => {
    expect(arena().mode).toBe('knockout');
    for (const book of ['basic', 'right', 'shared', 'all']) expect(arena({ playbook: book }).playbook).toBe(book);
    expect(G.createGame({ hostId: 'kf', drill: 'facts', playbook: 'mul', mode: 'knockout', seconds: 120, secondsPerPlay: 10 }).mode).toBe('knockout');
    expect(() => arena({ drill: 'geometry', playbook: 'all' })).toThrow(/Knockout Arena plays/);
    expect(() => arena({ drill: 'alg1m3', playbook: 'all' })).toThrow(/Knockout Arena plays/);
    expect(K.playable('congruence', 'all')).toBe(true);
    expect(K.playable('facts', 'sq')).toBe(false);
    expect(K.playable('nope', 'all')).toBe(false);
  });

  test('every drill marked for the arena has the same few short answers on every play', () => {
    const marked = Object.keys(DRILLS).filter((id) => DRILLS[id].arena === 'labels');
    expect(marked).toContain('congruence');
    for (const id of marked) {
      const g = arena({ drill: id });
      const [p] = seat(g, 2); G.start(g);
      const first = K.questionFor(g, p, 1).labels;
      expect(first.length).toBeGreaterThanOrEqual(3);
      expect(first.length).toBeLessThanOrEqual(8);
      for (const l of first) expect(l.length).toBeLessThanOrEqual(6); // it has to be read on an orb, on a phone
      expect(new Set(first).size).toBe(first.length);
      for (let n = 1; n <= 120; n++) {
        const q = K.questionFor(g, p, n);
        expect(q.labels).toEqual(first);
        expect(first).toContain(q.label);
        expect(q.fig).toMatch(/^<svg[\s\S]*<\/svg>$/); // every question is a picture
      }
      G._reset();
    }
  });
});

describe('every car has its own question', () => {
  test('a pure function of (seed, player, round): the same again, and different from the next car', () => {
    const g = arena(); const cars = seat(g, 12); G.start(g);
    const figs = cars.map((p) => K.questionFor(g, p, 1).fig);
    expect(cars.map((p) => K.questionFor(g, p, 1).fig)).toEqual(figs);
    expect(new Set(figs).size).toBeGreaterThanOrEqual(11); // twelve cars, twelve pictures (a repeat is a coincidence)
    // not everyone needs the same orb, so nobody can call the answer across the room
    let mixed = 0;
    for (let n = 1; n <= 30; n++) if (new Set(cars.map((p) => K.questionFor(g, p, n).label)).size >= 3) mixed++;
    expect(mixed).toBeGreaterThanOrEqual(28);
    // and a car's question changes every round
    expect(new Set(Array.from({ length: 20 }, (_, i) => K.questionFor(g, cars[0], i + 1).fig)).size).toBeGreaterThanOrEqual(19);
  });

  test('the orb the server accepts is the bank\'s graded answer to that very play, in the orb\'s short form', () => {
    const g = arena(); const cars = seat(g, 6); G.start(g);
    for (const p of cars) {
      for (let n = 1; n <= 60; n++) {
        const q = K.questionFor(g, p, n);
        const play = dealPlay('congruence', g.playbook, `${g.seed}:arena:${p.id}`, n);
        const keyed = play.choices.find((c) => c.k === play.answer).html;
        expect(q.answer).toBe(keyed);
        expect(q.label).toBe((CONG.ORB && CONG.ORB[keyed]) || keyed);
        expect(play.card).toContain(q.fig);
        expect(q.tell).toBe(play.tell);
      }
    }
  });

  test('"Not congruent" is short on an orb, and it is the only answer that is shortened', () => {
    expect(CONG.ORB[CONG.NONE]).toBe('Not ≅');
    expect(Object.keys(CONG.ORB)).toEqual([CONG.NONE]);
    const g = arena(); const [p] = seat(g, 2); G.start(g);
    expect(K.questionFor(g, p, 1).labels).toEqual(CONG.CHOICES.map((c) => CONG.ORB[c] || c));
  });
});

describe('the orbs of a round', () => {
  test('an orb for every car\'s answer, and at least one of every label', () => {
    for (const n of [2, 5, 12, 26, 34]) {
      for (const seed of ['a', 'b', 'c', 'd']) {
        const g = arena(); const cars = seat(g, n); g.seed = `${seed}${n}`; G.start(g);
        const r = g.ko.round;
        expect(r.kind).toBe('labels');
        expect(r.target).toBeNull();
        const have = {}; for (const c of r.chips) have[c.text] = (have[c.text] || 0) + 1;
        const want = {}; for (const p of cars) want[need(g, p)] = (want[need(g, p)] || 0) + 1;
        const vocab = K.questionFor(g, cars[0], 1).labels;
        for (const l of vocab) expect(have[l]).toBe(Math.max(1, want[l] || 0));
        expect(Object.keys(have).sort()).toEqual(vocab.slice().sort());
        G._reset();
      }
    }
  });

  test('dealt apart and off the cars, and they hold still until GO', () => {
    for (const n of [4, 12, 26]) {
      const g = arena(); const cars = seat(g, n); g.seed = `still${n}`; G.start(g);
      const r = g.ko.round;
      const at0 = r.chips.map((c) => K.chipAt(c, r.world, r.openedAt));
      // nothing moves through think time
      for (const t of [0, 1000, K.TUNE.label.thinkMs - 1, K.TUNE.label.thinkMs]) expect(r.chips.map((c) => K.chipAt(c, r.world, r.openedAt + t))).toEqual(at0);
      expect(r.chips.map((c) => K.chipAt(c, r.world, r.goAt + 3000))).not.toEqual(at0);
      // so at GO no two orbs are stacked and none is on a car
      for (let i = 0; i < at0.length; i++) {
        for (let j = i + 1; j < at0.length; j++) expect(Math.hypot(at0[i].x - at0[j].x, at0[i].y - at0[j].y)).toBeGreaterThan(K.TUNE.label.chipR * 1.6);
        for (const p of cars) expect(Math.hypot(at0[i].x - p.ko.x, at0[i].y - p.ko.y)).toBeGreaterThan(K.TUNE.label.eatDist + K.TUNE.label.chipR);
      }
      G._reset();
    }
  });

  test('the page draws the same still-then-drifting path the server checks grabs against', () => {
    const C = require('../../public/js/live-drill/knockout.js');
    const g = arena(); seat(g, 8); G.start(g);
    const r = g.ko.round;
    for (const c of r.chips) {
      for (const dt of [-4000, -1, 0, 1700, 9000]) expect(C.chipAt(c, r.world, r.goAt + dt, K.TUNE.margin)).toEqual(K.chipAt(c, r.world, r.goAt + dt));
    }
  });
});

describe('think time', () => {
  test('nothing can be grabbed before GO — not an orb, not a power-up — and the clock starts at GO', () => {
    const g = arena(); const [a] = seat(g, 4); G.start(g);
    const r = g.ko.round;
    expect(r.goAt - r.openedAt).toBe(K.TUNE.label.thinkMs);
    expect(r.closesAt - r.goAt).toBe(15000); // the round is as long as the teacher set, after the think
    expect(() => claim(g, a, own(g, a))).toThrow(/Not yet/);
    jest.advanceTimersByTime(K.TUNE.label.thinkMs - 10);
    expect(() => claim(g, a, own(g, a))).toThrow(/Not yet/);
    expect(a.ko.held).toHaveLength(0);
    jest.advanceTimersByTime(10);
    expect(claim(g, a, own(g, a))).toMatchObject({ ok: true, pts: K.TUNE.points.max }); // the first instant after GO pays full
    // and no power-up pops in during the think
    for (const p of r.powerups) expect(p.at).toBeGreaterThanOrEqual(r.goAt);
  });

  test('thinking is never on the points clock: an orb found t seconds after GO pays what it would with no think time', () => {
    const g = arena(); const [a] = seat(g, 4); G.start(g);
    const r = g.ko.round;
    go(g); jest.advanceTimersByTime(7500);
    const mid = Math.round((K.TUNE.points.max + K.TUNE.points.min) / 2);
    expect(claim(g, a, own(g, a)).pts).toBe(mid);
    expect(K.pointsFor(r, r.openedAt)).toBe(K.TUNE.points.max);
    expect(K.pointsFor(r, r.closesAt)).toBe(K.TUNE.points.min);
  });

  test('Math Facts rounds have none: they open live, as before', () => {
    const g = G.createGame({ hostId: 'kf2', drill: 'facts', playbook: 'mul', mode: 'knockout', seconds: 120, secondsPerPlay: 10 });
    const [a] = seat(g, 3); G.start(g);
    const r = g.ko.round;
    expect(r.kind).toBe('facts');
    expect(r.goAt).toBe(r.openedAt);
    expect(G.playerView(g, a).knockout.q).toBeUndefined();
    expect(G.rulesFor(g).knockout).toMatchObject({ kind: 'facts', thinkSec: 0, orbs: null });
    expect(claim(g, a, r.chips.find((c) => c.ok))).toMatchObject({ ok: true });
  });

  test('the lobby states the think time and the orbs the server plays', () => {
    const g = arena();
    const r = G.rulesFor(g).knockout;
    expect(r).toMatchObject({ kind: 'labels', thinkSec: K.TUNE.label.thinkMs / 1000, roundSec: 15 });
    expect(r.orbs).toEqual(['SSS', 'SAS', 'ASA', 'AAS', 'HL', 'Not ≅']);
  });
});

describe('what a screen may see', () => {
  test('a car is sent its own diagram and question, and never the answer while the round is open', () => {
    const g = arena(); const [a, b] = seat(g, 4); G.start(g);
    const va = G.playerView(g, a).knockout;
    expect(va.q).toEqual({ n: 1, fig: K.questionFor(g, a, 1).fig, ask: K.questionFor(g, a, 1).ask });
    expect(va.q.fig).not.toBe(G.playerView(g, b).knockout.q.fig);
    go(g);
    claim(g, a, other(g, a)); // a wrong grab does not give it away either
    const open = JSON.stringify([G.playerView(g, a).knockout, G.playerView(g, b).knockout, G.hostView(g).knockout]);
    expect(open).not.toMatch(/"ok"|"hits"|"label"|"answer"|"tell"|"got"/);
    // the picture carries no words that name the shortcut
    for (const l of ['SSS', 'SAS', 'ASA', 'AAS', 'HL']) expect(va.q.fig).not.toContain(l);
  });

  test('the projector is never sent anyone\'s question while a round is open', () => {
    const g = arena(); seat(g, 4); G.start(g);
    const host = G.hostView(g).knockout;
    expect(host.q).toBeUndefined();
    expect(host.look).toBeNull();
    expect(JSON.stringify(host)).not.toContain('<svg');
  });

  test('once the round closes each car is told its answer, and its orbs are marked for THAT car', () => {
    const g = arena(); const cars = seat(g, 5); G.start(g); go(g);
    const [a, b] = cars;
    claim(g, a, own(g, a));
    closeNow(g);
    for (const p of [a, b]) {
      const v = G.playerView(g, p).knockout;
      const q = K.questionFor(g, p, 1);
      expect(v.q).toMatchObject({ label: q.label, answer: q.answer, tell: q.tell, got: p === a });
      for (const c of v.round.chips) expect(c.ok).toBe(c.text === q.label);
    }
    // the projector has no car, so its orbs are neither right nor wrong
    expect(G.hostView(g).knockout.round.chips.every((c) => c.ok === null)).toBe(true);
  });
});

describe('a round', () => {
  test('an orb is right for the car whose question it answers and wrong for the others', () => {
    const g = arena(); const cars = seat(g, 8); G.start(g); go(g);
    const a = cars[0];
    const b = cars.find((p) => need(g, p) !== need(g, a));
    const chip = own(g, a);
    const miss = claim(g, b, chip);
    expect(miss).toMatchObject({ ok: false, label: true, text: chip.text });
    expect(chip.by).toBeNull(); // a wrong grab does not use the orb up
    expect(b.ko.held).toHaveLength(0);
    expect(b.ko.slowUntil).toBeGreaterThan(Date.now());
    expect(claim(g, b, chip)).toEqual({ again: true }); // stung once
    expect(claim(g, a, chip)).toMatchObject({ ok: true, text: chip.text });
    expect(chip.by).toBe(a.id);
  });

  test('a wrong label costs points (never below zero) and a right one is one orb each', () => {
    const g = arena(); const cars = seat(g, 6); G.start(g); go(g);
    const [a] = cars;
    expect(claim(g, a, other(g, a))).toMatchObject({ ok: false, cost: 0, total: 0 });
    a.ko.pts = 25; // (as if from earlier rounds)
    expect(claim(g, a, other(g, a))).toMatchObject({ ok: false, cost: K.TUNE.wrongCost, total: 25 - K.TUNE.wrongCost });
    expect(a.ko.wrong).toBe(2);
    jest.advanceTimersByTime(K.TUNE.slowMs);
    expect(claim(g, a, own(g, a))).toMatchObject({ ok: true, held: 1 });
    // safe: nothing else it touches counts, right or wrong
    const total = a.ko.pts;
    expect(claim(g, a, other(g, a))).toMatchObject({ safe: true });
    expect(a.ko.pts).toBe(total);
    expect(a.ko.wrong).toBe(2);
  });

  test('the round closes the moment all but one car is safe, and that car is out', () => {
    for (const n of [2, 3, 7, 16]) {
      const g = arena(); const cars = seat(g, n); g.seed = `close${n}`; G.start(g); go(g);
      for (let i = 0; i < n - 1; i++) {
        expect(g.ko.round.closed).toBe(false);
        expect(claim(g, cars[i], own(g, cars[i])).ok).toBe(true);
      }
      expect(g.ko.round.closed).toBe(true);
      expect(g.ko.round.out.map((o) => o.id || o)).toHaveLength(1);
      expect(cars.filter((p) => !p.ko.in)).toEqual([cars[n - 1]]);
      G._reset();
    }
  });

  test('the clock runs out on several: still exactly one car out', () => {
    const g = arena(); const cars = seat(g, 6); G.start(g); go(g);
    claim(g, cars[0], own(g, cars[0]));
    closeNow(g);
    expect(cars.filter((p) => !p.ko.in)).toHaveLength(1);
    expect(cars[0].ko.in).toBe(true);
  });

  test('nobody finds theirs: nobody is out', () => {
    const g = arena(); const cars = seat(g, 4); G.start(g);
    closeNow(g);
    expect(cars.every((p) => p.ko.in)).toBe(true);
  });

  test('the next round is a new question for every car, with its own think time', () => {
    const g = arena(); const cars = seat(g, 5); G.start(g); go(g);
    const before = cars.map((p) => G.playerView(g, p).knockout.q.fig);
    closeNow(g); nextRound();
    const r = g.ko.round;
    expect(r.n).toBe(2);
    expect(r.goAt - r.openedAt).toBe(K.TUNE.label.thinkMs);
    for (const p of cars.filter((x) => x.ko.in)) {
      const v = G.playerView(g, p).knockout.q;
      expect(v.n).toBe(2);
      expect(before).not.toContain(v.fig);
      expect(v.label).toBeUndefined();
    }
  });

  test('a car in the pit has no arena question; its plays are the bank\'s ordinary graded ones', () => {
    const g = arena(); const cars = seat(g, 3); G.start(g); go(g);
    claim(g, cars[0], own(g, cars[0])); claim(g, cars[1], own(g, cars[1]));
    nextRound();
    const out = cars[2];
    expect(out.ko.in).toBe(false);
    expect(G.playerView(g, out).knockout.q).toBeUndefined();
    const cur = G.currentPlay(g, out);
    const pl = G.playAt(g, cur.n);
    expect(G.answer(g, out, cur.n, pl.answer)).toMatchObject({ ok: true, knockout: { row: 1 } });
    expect(Object.keys(out.facts || {})).toHaveLength(0); // not Math Facts: nothing goes on a fact record
  });
});

describe('what the teacher gets', () => {
  test('"one to look at": after a round, a question someone missed, with its answer and no name', () => {
    const g = arena(); const cars = seat(g, 5); G.start(g); go(g);
    const [a, b] = cars;
    claim(g, a, other(g, a)); // a drives into a wrong label
    claim(g, b, own(g, b));
    closeNow(g);
    const look = G.hostView(g).knockout.look;
    const q = K.questionFor(g, a, 1);
    expect(look).toEqual({ n: 1, fig: q.fig, answer: q.answer, tell: q.tell });
    expect(JSON.stringify(look)).not.toContain(a.name);
    // it stays up through the next round's think time, and is replaced by the next round's
    nextRound();
    expect(G.hostView(g).knockout.look).toMatchObject({ n: 1 });
    go(g); closeNow(g); // nobody missed anything in round 2
    expect(G.hostView(g).knockout.look).toBeNull();
  });

  test('a round with no wrong grab has nothing to look at', () => {
    const g = arena(); const cars = seat(g, 4); G.start(g); go(g);
    claim(g, cars[0], own(g, cars[0]));
    closeNow(g);
    expect(G.hostView(g).knockout.look).toBeNull();
  });

  test('the final screen counts, per answer, how often it was asked, found, and missed', () => {
    const g = arena(); const cars = seat(g, 6); G.start(g);
    const tally = {};
    const add = (k, f) => { tally[k] = tally[k] || { asked: 0, safe: 0, wrong: 0 }; tally[k][f]++; };
    for (let round = 0; round < 3 && g.phase === 'live'; round++) {
      go(g);
      const live = cars.filter((p) => p.ko.in);
      const qs = new Map(live.map((p) => [p, K.questionFor(g, p, g.ko.round.n).answer]));
      claim(g, live[0], other(g, live[0])); add(qs.get(live[0]), 'wrong');
      jest.advanceTimersByTime(K.TUNE.slowMs);
      claim(g, live[1], own(g, live[1])); add(qs.get(live[1]), 'safe');
      for (const p of live) add(qs.get(p), 'asked');
      closeNow(g); nextRound();
    }
    G.endGame(g);
    const fin = G.hostView(g).final.knockout;
    expect(fin.kind).toBe('labels');
    expect(Object.fromEntries(fin.labels.map(({ answer, ...rest }) => [answer, rest]))).toEqual(tally);
    // the answers that gave the most trouble come first
    for (let i = 1; i < fin.labels.length; i++) expect(fin.labels[i - 1].wrong).toBeGreaterThanOrEqual(fin.labels[i].wrong);
  });
});

describe('a deploy mid-game', () => {
  test('a snapshot revives the round with the same orbs, the same questions, and its think time', () => {
    const g = arena(); const cars = seat(g, 4); G.start(g);
    jest.advanceTimersByTime(1500); // mid-think
    const figs = cars.map((p) => K.questionFor(g, p, 1).fig);
    const labels = cars.map((p) => K.questionFor(g, p, 1).label);
    const chips = g.ko.round.chips.map((c) => [c.id, c.text, c.x, c.y, c.t0]);
    const snap = JSON.parse(JSON.stringify(G.snapshot(g)));
    expect(JSON.stringify(snap)).not.toContain('<svg'); // questions are re-dealt from the seed, never stored
    G._reset();
    const h = G.hydrate(snap);
    const again = cars.map((p) => h.players.get(p.id));
    expect(again.map((p) => K.questionFor(h, p, 1).fig)).toEqual(figs);
    expect(again.map((p) => K.questionFor(h, p, 1).label)).toEqual(labels);
    expect(h.ko.round.chips.map((c) => [c.id, c.text, c.x, c.y, c.t0])).toEqual(chips);
    expect(h.ko.round.kind).toBe('labels');
    expect(() => claim(h, again[0], own(h, again[0]))).toThrow(/Not yet/);
    go(h);
    expect(claim(h, again[0], own(h, again[0]))).toMatchObject({ ok: true });
    closeNow(h);
    expect(h.ko.round.closed).toBe(true);
  });
});

/**
 * The simulator. A READER heads for the orb that answers its own diagram (with the bot's accuracy;
 * otherwise it picks a wrong label); a GUESSER drives into the nearest orb, whatever it says.
 */
describe('the simulator', () => {
  function play(seedN, profiles) {
    const g = arena({ seconds: 120, secondsPerPlay: 12 });
    const bots = profiles.map((pr, i) => ({ ...pr, p: G.join(g, `${pr.kind}${i}`).player }));
    let s = seedN * 9973 + 1;
    const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    G.start(g);
    let guard = 0;
    while (g.phase === 'live' && guard++ < 6000) {
      const r = g.ko.round;
      if (!r.closed && Date.now() >= r.goAt) {
        for (const b of bots) {
          if (!b.p.ko.in) {
            const cur = G.currentPlay(g, b.p); const pl = G.playAt(g, cur.n);
            const wrongKey = pl.choices.find((c) => c.k !== pl.answer).k;
            G.answer(g, b.p, cur.n, rnd() < b.acc ? pl.answer : wrongKey);
            continue;
          }
          if (b.p.ko.held.length || rnd() > b.pace || b.p.ko.slowUntil > Date.now()) continue;
          const open = r.chips.filter((c) => !c.by && !b.p.ko.ate.includes(c.id));
          const mine = need(g, b.p);
          let pool;
          if (b.kind === 'reader') pool = rnd() < b.acc ? open.filter((c) => c.text === mine) : open.filter((c) => c.text !== mine);
          else {
            const at = Date.now();
            pool = open.slice().sort((x, y) => { const px = K.chipAt(x, r.world, at); const py = K.chipAt(y, r.world, at); return Math.hypot(px.x - b.p.ko.x, px.y - b.p.ko.y) - Math.hypot(py.x - b.p.ko.x, py.y - b.p.ko.y); }).slice(0, 1);
          }
          if (!pool.length) continue;
          claim(g, b.p, pool[Math.floor(rnd() * pool.length)]);
          if (r.closed) break;
        }
      }
      jest.advanceTimersByTime(1000);
    }
    return { g, bots };
  }

  test('a class of 14 always finishes with one winner, one car out a round', () => {
    for (let i = 0; i < 10; i++) {
      const profiles = Array.from({ length: 14 }, (_, j) => ({ kind: 'reader', acc: 0.6 + (j % 5) * 0.08, pace: 0.5 }));
      const { g } = play(i, profiles);
      expect(g.phase).toBe('over');
      expect(g.ko.rounds).toBeGreaterThanOrEqual(13);
      expect(G.hostView(g).final.knockout.winner).toBeTruthy();
    }
  });

  test('reading the diagram beats driving into the nearest orb', () => {
    let reader = 0; let guesser = 0;
    for (let i = 0; i < 40; i++) {
      const profiles = Array.from({ length: 12 }, (_, j) => (j % 2 ? { kind: 'reader', acc: 0.9, pace: 0.5 } : { kind: 'guesser', acc: 0.5, pace: 0.9 }));
      const { g } = play(200 + i, profiles);
      if (/^reader/.test(G.hostView(g).final.knockout.winner)) reader++; else guesser++;
    }
    // the guesser acts nearly twice as often, and one orb in six is its own; it should still lose most games
    expect(reader).toBeGreaterThan(guesser * 2);
  });
});

describe('the pages', () => {
  const fs = require('fs');
  const path = require('path');
  const read = (f) => fs.readFileSync(path.join(__dirname, '../../public', f), 'utf8');

  test('the phone has a place for the diagram, inside the arena; the projector a place for the one to look at', () => {
    expect(read('play.html')).toMatch(/id="p-arena"[\s\S]*id="p-fig"/);
    expect(read('live-drill-host.html')).toMatch(/id="ko-look"/);
    expect(read('js/live-drill/play.js')).toMatch(/fig:\s*\$\('p-fig'\)/);
  });

  test('the host offers the arena for a labels drill, and the rules shown come from the server', () => {
    expect(read('js/live-drill/host.js')).toMatch(/arena === 'labels'/);
    const common = read('js/live-drill/common.js');
    expect(common).toMatch(/k\.thinkSec/);
    expect(common).toMatch(/k\.orbs/);
  });

  test('the diagram is a DOM box written on change, never drawn per frame, and nothing new is blurred', () => {
    const src = read('js/live-drill/knockout.js');
    expect(src).toMatch(/function syncFig/);
    expect(src).toMatch(/if \(css !== fig\.css\)/);
    expect(src).toMatch(/if \(cap !== fig\.cap\)/);
  });
});
