/**
 * Live Two-Minute Drill — Math Facts (fluency mode): utils/liveDrill/facts.js and its game rules.
 *
 * What these pin:
 *   - every dealt fact is arithmetically right, and its card never shows the answer while open;
 *   - answers are TYPED: "56", " 56 ", "−4" and "-4" grade, "fifty-six" is refused (not a sack);
 *   - a teacher's focus ("× 2s, 5s & 10s") puts one of those numbers in every fact;
 *   - each student's facts are tracked: missed, slow (right but over 3 s), fluent;
 *   - facts pay +6/+4/+2 at 3 s/6 s, sack −2 — and the lobby rules say exactly that.
 */
jest.useFakeTimers();
const F = require('../../utils/liveDrill/facts');
const { dealPlay, publicPlay } = require('../../utils/liveDrill/engine');
const G = require('../../utils/liveDrill/games');

afterEach(() => G._reset());

const evalFact = (label) => {
  const s = label.replace(/−/g, '-').replace(/×/g, '*').replace(/÷/g, '/')
    .replace(/√(\d+)/g, 'Math.sqrt($1)').replace(/(\d+)²/g, '($1**2)');
  return Function(`"use strict"; return (${s});`)();
};

describe('the bank', () => {
  test.each(Object.keys(F.BOOKS))('%s: 300 facts, every one right, none showing its answer', (book) => {
    for (let n = 1; n <= 300; n++) {
      const p = dealPlay('facts', book, `seed-${book}`, n, []);
      expect(p.input).toBe('number');
      expect(p.choices).toEqual([]);
      expect(Number(p.answer)).toBe(evalFact(p.fact.label));
      expect(Number.isInteger(Number(p.answer))).toBe(true);
      expect(p.card).not.toContain('blank ok');
      expect(p.revealCard).toContain('blank ok');
      if (book !== 'all') expect(p.playbook).toBe(book);
      else expect(['add', 'sub', 'mul', 'div']).toContain(p.playbook);
    }
  });

  test('no division by zero, no negative differences, products to 12 × 12', () => {
    for (let n = 1; n <= 500; n++) {
      const d = dealPlay('facts', 'div', 'z', n, []).fact;
      expect(d.a).toBeGreaterThan(0);
      expect(Number(dealPlay('facts', 'sub', 'z', n, []).answer)).toBeGreaterThanOrEqual(0);
      const m = dealPlay('facts', 'mul', 'z', n, []).fact;
      expect(Math.max(m.a, m.b)).toBeLessThanOrEqual(12);
    }
  });

  test('integer facts always have a negative in them', () => {
    for (let n = 1; n <= 200; n++) expect(dealPlay('facts', 'int', 'i', n, []).fact.label).toContain('−');
  });

  test('a fact the class just saw is not dealt again right away', () => {
    const recent = [];
    let repeats = 0;
    for (let n = 1; n <= 200; n++) {
      const p = dealPlay('facts', 'mul', 'r', n, recent.slice(-6).reverse());
      if (recent.slice(-6).includes(p.id)) repeats++;
      recent.push(p.id);
    }
    expect(repeats).toBe(0);
  });

  test('the open play tells the screen to show a number pad, and carries no answer', () => {
    const pub = publicPlay(dealPlay('facts', 'mul', 'p', 1, []));
    expect(pub.input).toBe('number');
    expect(Object.keys(pub).sort()).toEqual(['card', 'choices', 'head', 'id', 'input', 'playbook', 'playbookName']);
  });

  test('every multiplication strategy names the right product', () => {
    for (let a = 0; a <= 12; a++) for (let b = 0; b <= 12; b++) {
      const t = F._mulTell(a, b);
      if (a * b !== 0 && Math.min(a, b) !== 1) expect(t).toContain(String(a * b));
    }
  });
});

describe('typed answers', () => {
  test.each([['56', '56'], [' 56 ', '56'], ['056', '56'], ['−4', '-4'], ['-4', '-4'], ['-0', '0']])('%j reads as %s', (raw, v) => {
    expect(F.normalizeTyped(raw)).toBe(v);
  });
  test.each(['', 'fifty', '5.6', '5 6x', '1234567', null])('%j is not a number', (raw) => {
    expect(F.normalizeTyped(raw)).toBeNull();
  });
});

describe('a teacher\'s focus', () => {
  test('× 2s, 5s & 10s: every fact has a 2, 5 or 10 in it', () => {
    for (const book of ['mul', 'add', 'sub', 'div', 'all']) {
      for (let n = 1; n <= 200; n++) {
        const f = dealPlay('facts', book, 'f', n, [], { focus: [2, 5, 10] }).fact;
        const has = f.fam === 'mul' && /÷/.test(f.label) ? [2, 5, 10].includes(f.a) : [f.a, f.b].some((x) => [2, 5, 10].includes(x));
        expect(has).toBe(true);
      }
    }
  });

  test('a single times table still varies the other factor', () => {
    const others = new Set();
    for (let n = 1; n <= 100; n++) {
      const { a, b } = dealPlay('facts', 'mul', 'seven', n, [], { focus: [7] }).fact;
      expect(a === 7 || b === 7).toBe(true);
      others.add(a === 7 ? b : a);
    }
    expect(others.size).toBeGreaterThan(8);
  });

  test('the game keeps the focus, names it, and ignores junk', () => {
    const g = G.createGame({ hostId: 'h', drill: 'facts', playbook: 'mul', mode: 'drive', focus: [10, 2, 5, 2, 99, 'x'] });
    expect(g.focus).toEqual([2, 5, 10]);
    expect(g.playbookName).toBe('Multiplication · 2s, 5s & 10s');
    const p = G.playAt(g, 1).fact;
    expect([p.a, p.b].some((x) => [2, 5, 10].includes(x))).toBe(true);
    // no focus on a playbook it doesn't apply to, and none for the course drills
    expect(G.createGame({ hostId: 'h2', drill: 'facts', playbook: 'sq', mode: 'drive', focus: [2] }).focus).toBeNull();
    expect(G.createGame({ hostId: 'h3', drill: 'algebra', playbook: 'all', mode: 'drive', focus: [2] }).focus).toBeNull();
  });
});

describe('the game', () => {
  function factsDrive(opts = {}) {
    return G.createGame({ hostId: 'h', drill: 'facts', playbook: 'mul', mode: 'drive', ...opts });
  }
  function play(g, p, ms, typed) {
    const { n } = G.currentPlay(g, p);
    jest.advanceTimersByTime(ms);
    const pl = G.playAt(g, n);
    return G.answer(g, p, n, typed === undefined ? pl.answer : typed(pl));
  }

  test('facts pay +6/+4/+2 at 3 s/6 s and sack −2, and the lobby says so', () => {
    const g = factsDrive();
    const a = G.join(g, 'A').player;
    G.start(g);
    expect([play(g, a, 3000), play(g, a, 6000), play(g, a, 9000)].map((r) => r.gain)).toEqual([6, 4, 2]);
    expect(play(g, a, 1000, (pl) => String(Number(pl.answer) + 1)).gain).toBe(-2);
    const { rules } = G.hostView(g);
    expect(rules.speed).toEqual([{ gain: 6, within: 3 }, { gain: 4, within: 6 }, { gain: 2, within: null }]);
    expect(rules).toMatchObject({ sack: 2, typed: true, fluentSec: 3 });
  });

  test('a typed answer with a display minus or spaces still grades; junk is refused, not sacked', () => {
    const g = G.createGame({ hostId: 'h', drill: 'facts', playbook: 'int', mode: 'drive' });
    const a = G.join(g, 'A').player;
    G.start(g);
    const { n } = G.currentPlay(g, a);
    const pl = G.playAt(g, n);
    expect(() => G.answer(g, a, n, 'seven')).toThrow(/Type a number/);
    expect(a.att).toBe(0);
    const r = G.answer(g, a, n, ` ${pl.answer.replace('-', '−')} `);
    expect(r.ok).toBe(true);
  });

  test('Huddle counts what the class typed, and the reveal shows it', () => {
    const g = G.createGame({ hostId: 'h', drill: 'facts', playbook: 'mul', mode: 'huddle', secondsPerPlay: 10 });
    const a = G.join(g, 'A').player; const b = G.join(g, 'B').player; const c = G.join(g, 'C').player;
    G.start(g);
    const pl = G.playAt(g, 1);
    const wrong = String(Number(pl.answer) + 2);
    G.answer(g, a, 1, pl.answer); G.answer(g, b, 1, wrong); G.answer(g, c, 1, wrong);
    const r = G.hostView(g).round;
    expect(r.counts).toEqual({ [pl.answer]: 1, [wrong]: 2 });
    expect(g.secondsPerPlay).toBe(10);
  });

  test('every student\'s facts are tracked: fluent, slow, missed — and the class grid', () => {
    const g = factsDrive();
    const a = G.join(g, 'Ana').player;
    G.start(g);
    play(g, a, 1500); // fluent
    play(g, a, 5000); // slow
    const missed = G.playAt(g, 3).fact.label;
    play(g, a, 1000, (pl) => String(Number(pl.answer) + 1)); // missed
    G.endGame(g);
    const f = G.hostView(g).final.facts;
    const ana = f.students[0];
    expect(ana).toMatchObject({ name: 'Ana', att: 3, right: 2, fluent: 1 });
    expect(ana.missed).toEqual([missed]);
    expect(ana.slow).toHaveLength(1);
    expect(ana.slow[0].sec).toBe(5);
    expect(f.log).toHaveLength(3);
    expect(f.log[2]).toMatchObject({ name: 'Ana', ok: false, fact: missed });
    const grid = f.grids.find((x) => x.fam === 'mul');
    expect(grid.max).toBe(12);
    expect(Object.values(grid.cells).reduce((t, c) => t + c.att, 0)).toBe(3);
    // the student sees their own
    expect(G.playerView(g, a).facts).toMatchObject({ fluent: 1, missed: [missed] });
  });

  test('run it back clears the fact record', () => {
    const g = factsDrive();
    const a = G.join(g, 'A').player;
    G.start(g); play(g, a, 1000); G.endGame(g);
    G.rematch(g);
    expect(a.facts.size).toBe(0);
    expect(a.factLog).toEqual([]);
  });

  test('the course drills report no fact panel and keep their own scoring', () => {
    const g = G.createGame({ hostId: 'h', drill: 'algebra', playbook: 'all', mode: 'drive' });
    G.join(g, 'A'); G.start(g); G.endGame(g);
    expect(G.hostView(g).final.facts).toBeUndefined();
    expect(G.hostView(g).rules).toMatchObject({ sack: 5, typed: false });
  });
});
