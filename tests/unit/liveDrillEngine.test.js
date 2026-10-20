/**
 * The live drill runs the item bank straight out of the PUBLISHED drill pages
 * (public/courses/<course>/two-minute-drill.html — generator output, rewritten by every Course
 * Planner publish). These tests are the tripwire for a publish that moves the bank: if the
 * script can't be found, or makePlay stops producing four distinct choices that include the
 * answer, CI fails here instead of a class game failing on the projector.
 */
const { DRILLS, getDrill, listPlaybooks, dealPlay, publicPlay, _extractBank } = require('../../utils/liveDrill/engine');

// The banks read out of published course pages (Math Facts is native — tests/unit/liveDrillFacts.test.js).
const PAGES = Object.keys(DRILLS).filter((id) => !DRILLS[id].native);

describe('live drill engine', () => {
  test.each(Object.keys(DRILLS))('%s: the bank loads from the published page', (id) => {
    const drill = getDrill(id);
    expect(typeof drill.bank.makePlay).toBe('function');
    const books = listPlaybooks(id);
    expect(books.length).toBeGreaterThan(1);
    expect(books.map((b) => b.key)).toContain('all');
  });

  test.each(Object.keys(DRILLS))('%s: play n is a pure function of (seed, n)', (id) => {
    const a = dealPlay(id, 'all', 'seed-1', 4, []);
    const b = dealPlay(id, 'all', 'seed-1', 4, []);
    expect(b).toEqual(a);
    // …and the seed actually matters.
    const differs = [1, 2, 3, 4, 5, 6, 7, 8].some((n) =>
      JSON.stringify(dealPlay(id, 'all', 'seed-1', n, [])) !== JSON.stringify(dealPlay(id, 'all', 'seed-2', n, [])));
    expect(differs).toBe(true);
  });

  test('dealing does not leave Math.random seeded for the rest of the process', () => {
    dealPlay('algebra', 'all', 'x', 1, []);
    const draws = new Set(Array.from({ length: 5 }, () => Math.random()));
    expect(draws.size).toBe(5);
    // a second vm call must not reuse the last seed either
    expect(dealPlay('algebra', 'all', 'x', 1, [])).toEqual(dealPlay('algebra', 'all', 'x', 1, []));
  });

  test.each(PAGES)('%s: every play has four distinct choices, one of them the answer', (id) => {
    for (const book of listPlaybooks(id).map((b) => b.key)) {
      for (let n = 1; n <= 150; n++) {
        const p = dealPlay(id, book, `s-${book}`, n, []);
        const keys = p.choices.map((c) => c.k);
        expect(keys).toHaveLength(4);
        expect(new Set(keys).size).toBe(4);
        expect(keys).toContain(p.answer);
        expect(p.tell).toBeTruthy();
        expect(p.card).toBeTruthy();
        expect(p.choices.every((c) => typeof c.html === 'string' && c.html.length > 0)).toBe(true);
        if (book !== 'all') expect(p.playbook).toBe(book);
      }
    }
  });

  test('the public half of a play carries no answer', () => {
    for (const id of PAGES) {
      const pub = publicPlay(dealPlay(id, 'all', 'z', 1, []));
      expect(Object.keys(pub).sort()).toEqual(['card', 'choices', 'head', 'id', 'playbook', 'playbookName']);
      expect(pub.card).not.toMatch(/class="q ok"|posed-ans/);
    }
  });

  test('geometry figure plays carry the transversal diagram', () => {
    const fig = Array.from({ length: 60 }, (_, n) => dealPlay('geometry', 'par', 'fig', n + 1, []))
      .filter((p) => /<svg/.test(p.card));
    expect(fig.length).toBeGreaterThan(0);
  });

  test.each(Object.keys(DRILLS))('%s: every play has a one-line summary with text and no figure', (id) => {
    for (let n = 1; n <= 400; n++) {
      const { summary } = dealPlay(id, 'all', 'sum', n, []);
      expect(String(summary).replace(/<[^>]*>/g, '').trim()).not.toBe('');
      expect(summary).not.toMatch(/<svg|<table/);
    }
  });

  test('a problem that IS its figure ("find the hypotenuse" of a drawn triangle) is summarized by its question', () => {
    const plays = Array.from({ length: 80 }, (_, i) => dealPlay('algebra', 'geo', 'fig', i + 1, []));
    const figureOnly = plays.filter((p) => /pa solo/.test(p.summary));
    expect(figureOnly.length).toBeGreaterThan(0);
    for (const p of figureOnly) expect(p.card).toMatch(/<svg/); // the figure is still on the full card
  });

  test('a page without the app marker fails loudly, not silently', () => {
    expect(() => _extractBank('<script>const T = [];</script>')).toThrow(/item bank/);
  });
});
