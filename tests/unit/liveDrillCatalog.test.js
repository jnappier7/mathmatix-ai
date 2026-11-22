/**
 * The skill bank (utils/liveDrill/catalog.js): any catalog skill as a Live Drill game.
 *
 * What these pin: which items a skill can deal (multiple choice with a resolvable key, or a plain
 * integer — nothing else), the MIN_ITEMS floor, that a skill's items are pooled across every id the
 * canonicalizer maps to it, that a dealt play has the shape every game screen renders and is a
 * pure function of (seed, n) with its choices shuffled and relabelled, that authored text is
 * escaped and TeX rendered (a dollar amount stays money), that the bank is registered with the
 * engine OUTSIDE the fixed DRILLS table, and what search and browse answer.
 */
jest.mock('../../utils/skillCanonicalizer', () => ({
  skillLookupCandidates: (id) => (id === 'two-step-equations' ? ['two-step-equations', 'legacy-two-step'] : [id]),
}));
const catalog = require('../../utils/liveDrill/catalog');
const engine = require('../../utils/liveDrill/engine');
const solo = require('../../utils/liveDrill/solo');
const G = require('../../utils/liveDrill/games');
const rivals = require('../../utils/liveDrill/rivals');

const chain = (v) => ({ select: () => chain(v), limit: () => chain(v), lean: () => Promise.resolve(v) });

const SKILLS = [
  { skillId: 'two-step-equations', displayName: 'Two-Step Equations', studentLabel: 'Two-step equations', description: 'Solve ax + b = c for x.', category: 'equations', gradeBand: '5-8', grade: '7', courseLevel: 'MS' },
  { skillId: 'add-fractions', displayName: 'Adding Fractions', description: 'Add fractions with unlike denominators.', category: 'fractions', gradeBand: 'K-5', grade: '5' },
  { skillId: 'count-to-20', displayName: 'Count to 20', description: 'Counting.', category: 'counting-cardinality', grade: 'K' },
  { skillId: 'thin-skill', displayName: 'Thin Skill', description: 'Too few items.', category: 'equations', gradeBand: '5-8' },
  { skillId: 'bad id!', displayName: 'Bad', description: 'An id the route would never accept.', category: 'x' },
];
const mc = (id, skillId, i, extra = {}) => ({
  _id: id, problemId: id, skillId, isActive: true, difficulty: 1 + (i % 5),
  prompt: `Solve $2x + ${i} = ${2 * i + 4}$ for $x$.`, explanation: `Subtract ${i}, then halve.`,
  options: [{ label: 'A', text: `${i + 2}` }, { label: 'B', text: `${i}` }, { label: 'C', text: `${i + 1}` }, { label: 'D', text: `${i + 3}` }],
  correctOption: 'A', answer: { value: `${i + 2}` }, ...extra,
});
const PROBLEMS = [
  ...Array.from({ length: 8 }, (_, i) => mc(`p${i}`, 'two-step-equations', i)),
  ...Array.from({ length: 4 }, (_, i) => mc(`l${i + 8}`, 'legacy-two-step', i + 8)), // the same skill under its legacy id
  ...Array.from({ length: 6 }, (_, i) => ({ _id: `t${i}`, problemId: `t${i}`, skillId: 'two-step-equations', isActive: true, difficulty: 3, prompt: `Compute ${i} − 10.`, answer: { value: String(i - 10) } })),
  ...Array.from({ length: 6 }, (_, i) => mc(`f${i}`, 'add-fractions', i, { prompt: `Add: 1/${i + 2} + 1/2. A pencil costs $3 and $4.`, answer: { value: `${i + 2}` } })),
  ...Array.from({ length: 5 }, (_, i) => ({ _id: `c${i}`, problemId: `c${i}`, skillId: 'count-to-20', isActive: true, difficulty: 1, prompt: `What comes after ${i + 3}?`, answer: { value: i + 4 } })), // a NUMBER, as some banks store it
  ...Array.from({ length: 2 }, (_, i) => mc(`x${i}`, 'thin-skill', i)),
];
const counts = () => {
  const n = {};
  for (const p of PROBLEMS) n[p.skillId] = (n[p.skillId] || 0) + 1;
  return Object.entries(n).map(([_id, c]) => ({ _id, n: c }));
};
const models = {
  Skill: { find: jest.fn(() => chain(SKILLS)) },
  Problem: {
    aggregate: jest.fn(async () => counts()),
    find: jest.fn((q) => chain(PROBLEMS.filter((p) => q.skillId.$in.includes(p.skillId)))),
  },
};

let now = 1_700_000_000_000;
beforeEach(() => { catalog._reset(); G._reset(); catalog._setModels(models); catalog._setNow(() => now); models.Problem.find.mockClear(); models.Skill.find.mockClear(); });

describe('which items a skill can deal', () => {
  test('a multiple-choice item with a key, in the bank\'s own positional shape', () => {
    const it = catalog.toItem(mc('a', 's', 3));
    expect(it).toMatchObject({ id: 'a', kind: 'mc', correct: 0, options: ['5', '3', '4', '6'], difficulty: 4 });
  });
  test('the key follows the one rule every grader uses (the option whose text IS the answer), not a stale letter', () => {
    const it = catalog.toItem(mc('a', 's', 3, { correctOption: 'C' })); // options were shuffled after the letter was written
    expect(it.correct).toBe(0);
  });
  test('an integer answer is typed; a fraction, an expression or free text is not dealt', () => {
    expect(catalog.toItem({ problemId: 'i', prompt: 'q', answer: { value: '-12' } })).toMatchObject({ kind: 'typed', answer: '-12' });
    expect(catalog.toItem({ problemId: 'n', prompt: 'q', answer: { value: 7 } })).toMatchObject({ kind: 'typed', answer: '7' });
    expect(catalog.toItem({ problemId: 'f', prompt: 'q', answer: { value: '3/4' } })).toBeNull();
    expect(catalog.toItem({ problemId: 'e', prompt: 'q', answer: { value: '2x+1' } })).toBeNull();
    expect(catalog.toItem({ problemId: 'd', prompt: 'q', answer: { value: '1.5' } })).toBeNull();
  });
  test('an item with no prompt, no key, or two choices alike is left out', () => {
    expect(catalog.toItem({ problemId: 'a', options: [{ text: '1' }, { text: '2' }], correctOption: 'A' })).toBeNull();
    expect(catalog.toItem({ problemId: 'a', prompt: 'q', options: [{ text: '1' }, { text: '2' }], answer: { value: '9' } })).toBeNull();
    expect(catalog.toItem({ problemId: 'a', prompt: 'q', options: [{ text: '1' }, { text: '1 ' }], correctOption: 'A', answer: { value: '1' } })).toBeNull();
  });
});

describe('text', () => {
  test('authored text is escaped and TeX is rendered', () => {
    const html = catalog.render('Solve $x^2 = 4$ <b>now</b>');
    expect(html).toContain('class="katex"');
    expect(html).toContain('&lt;b&gt;now&lt;/b&gt;');
    expect(html).not.toContain('<b>');
  });
  test('a dollar amount is money, not math; \\( \\) and $$ $$ are always math', () => {
    expect(catalog.render('It costs $5 and $3 more.')).toBe('It costs $5 and $3 more.');
    expect(catalog.render('so \\(a+b\\) and $$c$$')).toMatch(/katex[\s\S]*katex-display/);
  });
  test('a figure is the item\'s own SVG and nothing scripted', () => {
    const svg = '<svg viewBox="0 0 10 10"><circle r="3"/></svg>';
    const ok = catalog.buildBank({ blurb: '' }, Array.from({ length: 5 }, (_, i) => mc(`s${i}`, 's', i, { svg })));
    expect(ok.makePlay('all', [], () => 0.1).card).toContain('class="fig"');
    const bad = catalog.buildBank({ blurb: '' }, Array.from({ length: 5 }, (_, i) => mc(`s${i}`, 's', i, { svg: '<svg onload="alert(1)"></svg>' })));
    expect(bad.makePlay('all', [], () => 0.1).card).not.toContain('onload');
  });
});

describe('the index and the bank', () => {
  test('a skill is in the bank when its items — pooled across every id that maps to it — reach the floor', async () => {
    const i = await catalog.index();
    expect(i.list.map((e) => `${e.skillId}:${e.items}`)).toEqual(['count-to-20:5', 'add-fractions:6', 'two-step-equations:18']);
    expect(i.list.map((e) => e.level)).toEqual(['elem', 'elem', 'ms']); // a grade of "K" lands in elementary; courseLevel wins where present
    expect(i.bySkill.get('thin-skill')).toBeUndefined();
    expect(i.bySkill.get('bad id!')).toBeUndefined();
  });
  test('the index is read once and refreshed after its TTL; a failed refresh keeps the last one', async () => {
    await catalog.index(); await catalog.index();
    expect(models.Skill.find).toHaveBeenCalledTimes(1);
    now += 16 * 60 * 1000;
    models.Skill.find.mockImplementationOnce(() => { throw new Error('mongo down'); });
    const i = await catalog.index();
    expect(i.list.length).toBe(3);
    expect(models.Skill.find).toHaveBeenCalledTimes(2);
  });
  test('prepare registers the skill with the engine, outside DRILLS, as a native bank with difficulty playbooks', async () => {
    const def = await catalog.prepare('two-step-equations');
    expect(def).toMatchObject({ dynamic: true, title: 'Two-step equations', items: 18, skillId: 'two-step-equations' });
    expect(engine.DRILLS['skill:two-step-equations']).toBeUndefined();
    expect(engine.defOf('skill:two-step-equations')).toBe(def);
    expect(Object.keys(def.native.BOOKS)).toEqual(['all', 'easier', 'medium']); // 'harder' has too few items for a book of its own
    expect(engine.listPlaybooks('skill:two-step-equations').map((b) => b.name)).toEqual(['All problems', 'Easier', 'Medium']);
    expect(await catalog.prepare('thin-skill')).toBeNull();
    expect(await catalog.prepare('no-such-skill')).toBeNull();
    expect(await catalog.prepare('../etc')).toBeNull();
    expect(await catalog.ready('skill:two-step-equations')).toBe(true);
    expect(await catalog.ready('facts')).toBe(false); // not a skill drill: the caller checks the hubs
  });
  test('a prepared bank is reused, and concurrent callers share one read', async () => {
    await Promise.all([catalog.prepare('add-fractions'), catalog.prepare('add-fractions')]);
    await catalog.prepare('add-fractions');
    expect(models.Problem.find).toHaveBeenCalledTimes(1);
  });
});

describe('a dealt play', () => {
  const D = 'skill:two-step-equations';
  beforeEach(() => catalog.prepare('two-step-equations'));

  test('has the shape every game screen renders and is a pure function of (seed, n)', () => {
    const a = engine.dealPlay(D, 'all', 'seed-a', 3, []);
    const b = engine.dealPlay(D, 'all', 'seed-a', 3, []);
    expect(a).toEqual(b);
    expect(engine.dealPlay(D, 'all', 'seed-b', 3, [])).not.toEqual(a);
    for (const k of ['id', 'playbook', 'playbookName', 'head', 'card', 'choices', 'answer', 'answerHtml', 'tell', 'revealCard', 'summary']) expect(a).toHaveProperty(k);
    expect(engine.publicPlay(a)).not.toHaveProperty('answer');
  });
  test('choices are shuffled with the seed and relabelled, and the key follows its text', () => {
    const orders = new Set();
    for (let n = 1; n <= 30; n++) {
      const p = engine.dealPlay(D, 'easier', 'seed-c', n, []);
      if (p.input) continue;
      expect(p.choices.map((c) => c.k)).toEqual(['A', 'B', 'C', 'D']);
      const i = Number(p.id.replace(/^[pl]/, '')); // mc(id, …, i): the key's text is i + 2
      expect(p.choices.find((c) => c.k === p.answer).html).toBe(String(i + 2));
      expect(p.answerHtml).toBe(String(i + 2));
      orders.add(p.choices.map((c) => c.html).join(','));
    }
    expect(orders.size).toBeGreaterThan(1);
  });
  test('an integer item is typed on the pad, with a ± key because the skill has negative answers', () => {
    const plays = Array.from({ length: 60 }, (_, n) => engine.dealPlay(D, 'all', 'seed-d', n + 1, []));
    const typed = plays.find((p) => p.input === 'number');
    expect(typed).toMatchObject({ neg: true, choices: [], head: 'Type the answer.' });
    expect(typed.answer).toMatch(/^-?\d+$/);
    expect(typed.revealCard).toContain('posed-ans');
  });
  test('the tell carries the answer and the item\'s explanation, escaped', () => {
    const p = engine.dealPlay(D, 'easier', 'seed-e', 1, []);
    expect(p.tell).toMatch(/^<b>\d+<\/b> &mdash; Subtract \d+, then halve\.$/);
    expect(p.card).toContain('class="katex"');
  });
  test('a round steers away from the last six items, and a difficulty book deals only its tier', () => {
    const plays = solo.deal(D, 'all', 'Abc12345', 0, 40);
    for (let i = 1; i < plays.length; i++) expect(plays.slice(Math.max(0, i - 6), i).map((p) => p.id)).not.toContain(plays[i].id);
    const easy = solo.deal(D, 'easier', 'Abc12345', 0, 20);
    expect(easy.every((p) => p.playbook === 'easier')).toBe(true);
    expect(solo.parseDeal({ drill: D, seed: 'Abc12345', from: '0', book: 'medium' })).toMatchObject({ drill: D, playbook: 'medium' });
    expect(solo.parseDeal({ drill: 'skill:nope', seed: 'Abc12345', from: '0' }).error).toBeTruthy();
  });
  test('every game can be played on it against the computer, and the game remembers the skill for the way back', () => {
    for (const mode of ['drive', 'huddle', 'hill', 'heist']) {
      const { game, token } = rivals.open({ drill: D, playbook: 'all', mode, level: 'easy', name: 'You', hub: 'skills', skill: 'two-step-equations' });
      expect(G.playerView(game, G.playerFor(game, token)).solo).toMatchObject({ hub: 'skills', skill: 'two-step-equations' });
    }
    // Knockout Arena builds orbs from facts or a labelled bank, which a catalog skill is not
    expect(() => rivals.open({ drill: D, playbook: 'all', mode: 'knockout', level: 'easy', name: 'You', hub: 'skills' })).toThrow(/Knockout Arena/);
    expect(catalog.hubView(engine.defOf(D)).games[0].arena).toBe(false);
  });
  test('the skill-bank hub view is one game with the picks every hub offers', () => {
    const v = catalog.hubView(engine.defOf(D));
    expect(v).toMatchObject({ id: solo.SKILLS_HUB, title: 'Two-step equations' });
    expect(v.skill).toMatchObject({ skillId: 'two-step-equations', items: 18, url: '/drill/skills?skill=two-step-equations' });
    expect(v.games).toHaveLength(1);
    expect(v.games[0]).toMatchObject({ drill: D, typed: false, graded: false });
    expect(v.games[0].clock.seconds).toContain(120);
    expect(v.versus.levels.map((l) => l.id)).toEqual(['easy', 'medium', 'hard']);
    expect(v.hubs.map((h) => h.id)).toEqual(Object.keys(solo.HUBS));
  });
});

describe('where a skill sits for browsing', () => {
  test('its course first, then its band, its grade, and last its category', () => {
    expect(catalog.levelOf({ courseLevel: 'GEO', gradeBand: 'K-5' })).toBe('geo');
    expect(catalog.levelOf({ gradeBand: '8-12' })).toBe('hs');
    expect(catalog.levelOf({ grade: '6–7' })).toBe('ms');
    expect(catalog.levelOf({ grade: 'K' })).toBe('elem');
    expect(catalog.levelOf({ category: 'limits' })).toBe('calc');
    expect(catalog.levelOf({ category: 'triangles' })).toBe('geo');
    expect(catalog.levelOf({ category: 'fractions' })).toBe('ms');
    expect(catalog.levelOf({ category: 'functions' })).toBe('hs');
    expect(catalog.levelOf({})).toBe('other');
  });
});

describe('search and browse', () => {
  beforeEach(() => catalog.index());
  test('every typed word must hit, by prefix, on the name, formal name, category, description or id', () => {
    expect(catalog.search('two step').map((e) => e.skillId)).toEqual(['two-step-equations']);
    expect(catalog.search('equation').map((e) => e.skillId)).toEqual(['two-step-equations']);
    expect(catalog.search('fraction').map((e) => e.skillId)).toEqual(['add-fractions']);
    expect(catalog.search('counting').map((e) => e.skillId)).toEqual(['count-to-20']);
    expect(catalog.search('two fractions')).toEqual([]);
    expect(catalog.search('')).toEqual([]);
  });
  test('a result carries what the pages render, and never the item ids', () => {
    const [r] = catalog.search('two step');
    expect(r).toMatchObject({ drill: 'skill:two-step-equations', name: 'Two-step equations', formal: 'Two-Step Equations', categoryTitle: 'Equations', level: 'ms', items: 18, url: '/drill/skills?skill=two-step-equations' });
    expect(r.ids).toBeUndefined();
  });
  test('browse groups the bank by level, then category, in the order a student climbs', () => {
    const b = catalog.browse();
    expect(b.skills).toBe(3);
    expect(b.levels.map((l) => `${l.id}:${l.skills}`)).toEqual(['elem:2', 'ms:1']);
    expect(b.levels[0].categories.map((c) => c.id).sort()).toEqual(['counting-cardinality', 'fractions']);
    expect(b.levels[1].categories[0].skills[0]).toEqual({ drill: 'skill:two-step-equations', skillId: 'two-step-equations', name: 'Two-step equations', items: 18, url: '/drill/skills?skill=two-step-equations' });
  });
});

describe('the engine\'s dynamic table', () => {
  test('a fixed drill cannot be replaced; an unused dynamic one is swept', () => {
    expect(() => engine.registerDrill('facts', { native: {} })).toThrow(/fixed/);
    engine.registerDrill('skill:tmp', { native: { BOOKS: { all: { name: 'x' } }, makePlay: () => ({}) }, title: 'tmp' });
    expect(engine.defOf('skill:tmp')).toBeTruthy();
    engine._dynamic.get('skill:tmp').touchedAt = Date.now() - 3 * 60 * 60 * 1000;
    engine.sweepDynamic(2 * 60 * 60 * 1000);
    expect(engine.defOf('skill:tmp')).toBeNull();
    expect(engine.getDrill('skill:tmp')).toBeNull();
  });
});
