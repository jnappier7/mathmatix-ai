/**
 * Live Drill — picking a SECTION of a module (5.1, 5.2, …) on the host's setup.
 *
 * The banks label every playbook with the sections it covers ("5.1", "5.3–5.5", "2.4, 2.7");
 * engine.js derives the numbered section list from those labels (never a second catalog), and a
 * section key sent as the playbook deals from EVERY book that covers it. What these pin:
 *   - the labels parse the way the banks print them, and a gap is listed (greyed), not skipped;
 *   - a section pick deals only from its books, reaches all of them, and stays a pure function
 *     of (seed, n) — a reconnect sees the same play;
 *   - a game, the solo deal and the topic search all take the key ("5.2").
 */
const { DRILLS, listPlaybooks, listSections, sectionsOfLabel, resolvePlaybook, dealPlay } = require('../../utils/liveDrill/engine');
const G = require('../../utils/liveDrill/games');
const solo = require('../../utils/liveDrill/solo');
const { search } = require('../../utils/liveDrill/search');

afterEach(() => G._reset());

describe('section labels', () => {
  test('parse the way the banks print them', () => {
    expect(sectionsOfLabel('5.1')).toEqual(['5.1']);
    expect(sectionsOfLabel('5.3–5.5')).toEqual(['5.3', '5.4', '5.5']);
    expect(sectionsOfLabel('1.5-1.6')).toEqual(['1.5', '1.6']);
    expect(sectionsOfLabel('2.4, 2.7')).toEqual(['2.4', '2.7']);
    expect(sectionsOfLabel('2.7–3.1')).toEqual(['2.7', '3.1']);
    expect(sectionsOfLabel('10.2–10.3')).toEqual(['10.2', '10.3']);
  });

  test('labels with no N.M cover nothing', () => {
    for (const ch of ['Mod 5', 'Ch. 2–3', 'ACT style', 'Q1–5', 'Q10–14, 17', 'MC 1–8', '+−×÷', 'x²', 'Mixed', '', null]) {
      expect(sectionsOfLabel(ch)).toEqual([]);
    }
  });
});

describe('listSections', () => {
  test('Module 5: 5.1 … 5.5 in order; 5.2 is covered by two books; a 5.3–5.5 book covers 5.4', () => {
    const secs = listSections('alg1m5');
    expect(secs.map((s) => s.key)).toEqual(['5.1', '5.2', '5.3', '5.4', '5.5']);
    expect(secs.find((s) => s.key === '5.2').books).toEqual(['forms', 'parperp']);
    expect(secs.find((s) => s.key === '5.2').topics).toEqual(['Point-Slope & Standard', 'Parallel & Perpendicular']);
    expect(secs.find((s) => s.key === '5.4').books).toEqual(['fit']);
    for (const s of secs) expect(s.name).toBe(`Section ${s.key}`);
  });

  test('a number the course skips is not a pick: Module 4 is 4.1, 4.2, 4.3, 4.5 (no 4.4 anywhere in the packets)', () => {
    expect(listSections('alg1m4').map((s) => s.key)).toEqual(['4.1', '4.2', '4.3', '4.5']);
    expect(listSections('alg1m9').map((s) => s.key)).toEqual(['9.1', '9.3', '9.5']);
    for (const id of Object.keys(DRILLS)) for (const s of listSections(id)) expect(s.books.length).toBeGreaterThan(0);
  });

  test('drills whose labels carry no sections have none: Math Facts, a Test Prep, the course pages', () => {
    for (const id of ['facts', 'alg1m3', 'hgeo3', 'algebra', 'geometry', 'alg2', 'alg1m13']) expect(listSections(id)).toEqual([]);
  });

  test("every section's books are the drill's own playbooks, and every N.M-labelled book is reachable from a section", () => {
    for (const id of Object.keys(DRILLS)) {
      const books = listPlaybooks(id);
      const keys = new Set(books.map((b) => b.key));
      const reachable = new Set();
      for (const s of listSections(id)) {
        expect(/^\d+\.\d+$/.test(s.key)).toBe(true);
        for (const b of s.books) { expect(keys.has(b)).toBe(true); reachable.add(b); }
      }
      for (const b of books) if (sectionsOfLabel(b.ch).length) expect(reachable.has(b.key)).toBe(true);
    }
  });
});

describe('resolvePlaybook', () => {
  test('a book is itself; a section is every book that covers it; anything else is the whole bank', () => {
    expect(resolvePlaybook('alg1m5', 'sif')).toEqual({ key: 'sif', name: 'Slope-Intercept Form', books: ['sif'] });
    expect(resolvePlaybook('alg1m5', '5.2')).toEqual({ key: '5.2', name: 'Section 5.2', books: ['forms', 'parperp'], section: true });
    expect(resolvePlaybook('alg1m5', '5.4')).toMatchObject({ key: '5.4', books: ['fit'] });
    for (const k of ['4.4', '9.9', 'zzz', '', undefined, null, '5.2.1', 'all']) expect(resolvePlaybook('alg1m4', k).key).toBe('all'); // 4.4: not in the course
    expect(resolvePlaybook('facts', '1.1').key).toBe('all');
  });
});

describe('several sections at once ("everything through 5.2")', () => {
  test('a comma-joined key is the union of their books, canonical whatever the order or repeats', () => {
    expect(resolvePlaybook('alg1m5', '5.1,5.2')).toEqual({ key: '5.1,5.2', name: 'Sections 5.1 & 5.2', books: ['sif', 'forms', 'parperp'], section: true });
    expect(resolvePlaybook('alg1m5', '5.2, 5.1, 5.2').key).toBe('5.1,5.2');
    expect(resolvePlaybook('alg1m5', '5.1,5.2,5.4')).toMatchObject({ key: '5.1,5.2,5.4', name: 'Sections 5.1, 5.2 & 5.4', books: ['sif', 'forms', 'parperp', 'fit'] });
    expect(resolvePlaybook('alg1m5', '5.3,5.4,5.5').books).toEqual(['fit']); // one book covers all three — dealt once, not thrice
  });

  test('unknown parts are dropped; a book inside a chosen section adds nothing; books alone can be mixed too', () => {
    expect(resolvePlaybook('alg1m5', '5.1,4.4,zzz').key).toBe('5.1');
    expect(resolvePlaybook('alg1m5', 'all,5.1').key).toBe('5.1');
    expect(resolvePlaybook('alg1m5', '5.1,sif')).toMatchObject({ key: '5.1', name: 'Section 5.1' });
    expect(resolvePlaybook('alg1m5', '5.1,review')).toMatchObject({ key: '5.1,review', name: 'Section 5.1 + Cumulative Review', books: ['sif', 'review'] });
    expect(resolvePlaybook('alg1m5', 'sif,review')).toMatchObject({ key: 'sif,review', name: 'Slope-Intercept Form & Cumulative Review', books: ['sif', 'review'] });
    expect(resolvePlaybook('alg1m5', '4.4,9.9').key).toBe('all');
  });

  test('deals from every book of every chosen section, and only those', () => {
    const seen = new Set();
    for (let n = 1; n <= 60; n++) {
      const p = dealPlay('alg1m5', '5.1,5.2', 'seed-m', n, []);
      expect(['sif', 'forms', 'parperp']).toContain(p.playbook);
      seen.add(p.playbook);
    }
    expect([...seen].sort()).toEqual(['forms', 'parperp', 'sif']);
  });

  test('a class game and the solo deal take it; the lobby says "Sections 5.1 & 5.2"', () => {
    const g = G.createGame({ hostId: 't', drill: 'alg1m5', playbook: '5.2,5.1', mode: 'huddle', plays: 10, secondsPerPlay: 20 });
    expect(g.playbook).toBe('5.1,5.2');
    expect(G.hostView(g).playbookName).toBe('Sections 5.1 & 5.2');
    expect(solo.parseDeal({ drill: 'alg1m5', book: '5.1,5.2', seed: 'abcdef1234', from: 0 }).playbook).toBe('5.1,5.2');
  });

  test('Find a topic: "5.1 5.2" offers both together first, then each', () => {
    const r = search('5.1 5.2');
    expect(r[0]).toMatchObject({ drill: 'alg1m5', key: '5.1,5.2', name: 'Sections 5.1 & 5.2' });
    expect(r.some((x) => x.drill === 'hgeo5' && x.key === '5.1,5.2')).toBe(true);
    expect(r.some((x) => x.drill === 'alg1m5' && x.key === '5.2')).toBe(true);
    expect(search('5.1 5.9')).toEqual([]); // nothing has a 5.9
  });
});

describe('dealing from a section', () => {
  test('deals only from the books that cover it, reaches every one of them, and is a pure function of (seed, n)', () => {
    const seen = new Set();
    for (let n = 1; n <= 40; n++) {
      const p = dealPlay('alg1m5', '5.2', 'seed-a', n, []);
      expect(['forms', 'parperp']).toContain(p.playbook);
      expect(p.playbookName).toBe(['forms', 'parperp'].includes(p.playbook) ? p.playbookName : '');
      seen.add(p.playbook);
      expect(dealPlay('alg1m5', '5.2', 'seed-a', n, []).id).toBe(p.id);
    }
    expect([...seen].sort()).toEqual(['forms', 'parperp']);
  });

  test('a one-book section deals exactly what that book deals', () => {
    for (let n = 1; n <= 10; n++) {
      expect(dealPlay('alg1m5', '5.4', 's', n, []).id).toBe(dealPlay('alg1m5', 'fit', 's', n, []).id);
    }
  });

  test('a section the bank does not cover falls back to the whole module, never throws', () => {
    expect(() => dealPlay('alg1m4', '4.4', 's', 1, [])).not.toThrow();
    expect(dealPlay('alg1m4', '4.4', 's', 3, []).id).toBe(dealPlay('alg1m4', 'all', 's', 3, []).id);
  });

  test('a class game takes the section as its playbook and the lobby names it', () => {
    const g = G.createGame({ hostId: 't', drill: 'alg1m5', playbook: '5.2', mode: 'drive' });
    expect(g.playbook).toBe('5.2');
    expect(g.playbookName).toBe('Section 5.2');
    expect(G.hostView(g).playbookName).toBe('Section 5.2');
    for (const p of g.deck.slice(0, 20)) expect(['forms', 'parperp']).toContain(p.playbook);
  });

  test('the solo deal takes the section key too', () => {
    const q = solo.parseDeal({ drill: 'alg1m5', book: '5.2', seed: 'abcdef1234', from: 0 });
    expect(q.playbook).toBe('5.2');
    expect(solo.parseDeal({ drill: 'alg1m5', book: '5.9', seed: 'abcdef1234', from: 0 }).playbook).toBe('all');
    const hub = solo.hubView('algebra');
    expect(hub.games.find((g) => g.drill === 'alg1m5').sections.map((s) => s.key)).toEqual(['5.1', '5.2', '5.3', '5.4', '5.5']);
  });
});

describe('Find a topic', () => {
  test('"5.2" lands on section 5.2 — its books beneath, never 2.5, never every "5" and "2"', () => {
    const r = search('5.2');
    expect(r[0]).toMatchObject({ drill: 'alg1m5', key: '5.2', name: 'Section 5.2' });
    expect(r.every((x) => x.ch.includes('5.2') || x.key === '5.2')).toBe(true);
    expect(r.some((x) => x.drill === 'alg1m2')).toBe(false); // 2.5 Absolute Value is not 5.2
    expect(r.some((x) => x.drill === 'hgeo5' && x.key === '5.2')).toBe(true); // the geometry chapter has a 5.2 too
  });

  test('a section number with a topic word narrows to that book', () => {
    expect(search('5.2 parallel')[0]).toMatchObject({ drill: 'alg1m5', key: 'parperp' });
  });

  test('a topic word alone lands on the book, not on a "Section N.M" entry beside it', () => {
    expect(search('box plots').some((x) => /^\d+\.\d+$/.test(x.key))).toBe(false);
    expect(search('4.4')).toEqual([]); // the course has no 4.4
  });
});
