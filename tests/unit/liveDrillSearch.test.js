/**
 * Drill search (utils/liveDrill/search.js): find a game and playbook by skill or topic.
 *
 * Pins three things: the index covers EVERY playbook of every registered drill (a new bank is
 * searchable the moment it lands in DRILLS); the words a teacher or student actually types land
 * on the right section; and a result always names a course page the picker can open.
 */
const { search, buildIndex, expand, words, ALIASES, LIMIT } = require('../../utils/liveDrill/search');
const { DRILLS, listPlaybooks } = require('../../utils/liveDrill/engine');
const { HUBS } = require('../../utils/liveDrill/solo');

const top = (q, n = 1) => search(q).slice(0, n).map((r) => `${r.drill}/${r.key}`);
const drillsIn = (q) => [...new Set(search(q).map((r) => r.drill))];

describe('the index', () => {
  const index = buildIndex();

  test('holds every playbook of every registered drill, once', () => {
    const expected = [];
    for (const id of Object.keys(DRILLS)) for (const b of listPlaybooks(id)) expected.push(`${id}/${b.key}`);
    const got = index.map((e) => `${e.drill}/${e.key}`);
    expect(got.sort()).toEqual(expected.sort());
    expect(new Set(got).size).toBe(got.length);
  });

  test('every entry names the course page it is played on', () => {
    const onHub = new Set(Object.values(HUBS).flatMap((h) => h.games.map((g) => g.drill)));
    for (const e of index) {
      expect(onHub.has(e.drill)).toBe(true);
      expect(['algebra', 'geometry']).toContain(e.hub);
      expect(e.title).toBeTruthy();
      expect(e.name).toBeTruthy();
    }
  });

  test('aliases are lowercase words the tokenizer would produce', () => {
    for (const [k, vs] of Object.entries(ALIASES)) {
      expect(k).toBe(k.toLowerCase());
      for (const v of vs) expect(words(v)).toEqual([v]);
    }
  });
});

describe('what people type', () => {
  test.each([
    ['completing the square', 'alg1m11/roots'],
    ['box plot', 'alg1m12/box'],
    ['box plots', 'alg1m12/box'],
    ['trapezoid', 'hgeo7/trap'],
    ['pythagorean', 'hgeo9/pyth'],
    ['inscribed angles', 'hgeo10/inscribed'],
    ['geometric sequences', 'alg1m9/seq'],
    ['arithmetic sequences', 'alg1m4/seq'],
    ['rational exponents', 'alg1m8/rational'],
    ['special right triangles', 'hgeo9/special'],
    ['law of sines', 'hgeo9/laws'],
    ['midsegment', 'hgeo6/mid'],
    ['elimination', 'alg1m7/elim'],
    ['scatter plot', 'alg1m5/fit'],
    ['outliers', 'alg1m12/outliers'],
  ])('%s → %s', (q, want) => {
    expect(top(q)).toEqual([want]);
  });

  test('a section beats its Whole Module on the same words', () => {
    const r = search('completing the square');
    expect(r[0].key).toBe('roots');
    expect(r.find((x) => x.key === 'all').score).toBeLessThan(r[0].score);
  });

  test('student shorthand reaches the lesson through aliases', () => {
    expect(top('SOHCAHTOA', 3)).toContain('hgeo9/trig');
    expect(top('FOIL', 2)).toContain('alg1m10/mult');
    expect(top('times tables')).toEqual(['facts/mul']);
    expect(top('y=mx+b', 3)).toContain('algebra/m4');
    expect(drillsIn('volume')).toContain('hgeo11');
    expect(drillsIn('circles')).toEqual(expect.arrayContaining(['hgeo10', 'hgeo11']));
  });

  test('a module or chapter number finds that drill, not a question range with the digit', () => {
    expect(drillsIn('chapter 9')[0]).toBe('hgeo9');
    expect(search('chapter 9').every((r) => r.drill === 'hgeo9')).toBe(true);
    expect(drillsIn('module 11')[0]).toBe('alg1m11');
    expect(search('module 11').every((r) => r.drill === 'alg1m11')).toBe(true);
    expect(drillsIn('mod 4')[0]).toBe('alg1m4');
  });

  test('a bare digit matches a whole word, never every 1x section', () => {
    for (const r of search('1')) {
      const hay = `${r.title} ${r.ch} ${r.name} ${r.blurb}`;
      expect(words(hay)).toContain('1');
    }
  });

  test('every typed word must hit', () => {
    expect(search('circles xyzzy')).toEqual([]);
    expect(search('xyzzy')).toEqual([]);
  });

  test('empty and junk queries return nothing; long ones are cut, not rejected', () => {
    expect(search('')).toEqual([]);
    expect(search('   ')).toEqual([]);
    expect(search(null)).toEqual([]);
    expect(search('!!! ???')).toEqual([]);
    expect(() => search('slope '.repeat(100))).not.toThrow();
  });

  test('results are capped and carry what the picker needs', () => {
    const r = search('review');
    expect(r.length).toBeLessThanOrEqual(LIMIT);
    expect(search('review', { limit: 3 })).toHaveLength(3);
    for (const x of r) {
      expect(Object.keys(x).sort()).toEqual(['blurb', 'ch', 'drill', 'game', 'hub', 'hubTitle', 'key', 'name', 'score', 'title']);
      expect(DRILLS[x.drill]).toBeDefined();
      expect(listPlaybooks(x.drill).some((b) => b.key === x.key)).toBe(true);
    }
  });

  test('expand keeps the typed words and gives each its own alias group', () => {
    const { own, groups } = expand('law of sines');
    expect(own).toEqual(['law', 'of', 'sines']);
    expect(groups.map((g) => g.word)).toEqual(own);
    expect(groups[0].aliases).toContain('laws');
    expect(groups[2].aliases).not.toContain('sines'); // a word is never its own alias
    expect(expand('xyzzy').groups[0].aliases).toEqual([]);
  });
});
