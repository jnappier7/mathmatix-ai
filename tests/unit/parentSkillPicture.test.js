// One classification for the parent dashboard card, the Learning Report and the
// analytics card. Fixtures mirror the two production children the 2026-10-14 QA
// pass found contradicting themselves (see utils/parentSkillPicture.js).

const { buildSkillPicture, classifySkill } = require('../../utils/parentSkillPicture');

const NOW = new Date('2026-10-14T15:00:00Z').getTime();
const daysAgo = (n) => new Date(NOW - n * 86400000);

// Ids that must never reach a parent: junk, or a raw/encoded skill id.
const RAW_ID = /^[a-z0-9]+(-[a-z0-9]+)+$|^[A-Z0-9]+([._][A-Z0-9]+)+$/;
const isLeak = (text) => /\bundefined\b|\bnull\b/.test(text) || RAW_ID.test(text);

const INFO = {
  'act-sequences': { name: 'Sequences', category: null },
  'function-basics': { name: 'Function Basics', category: 'Functions' },
  'addition-within-100': { name: 'Addition Within 100', category: 'Operations' },
  'classify-shapes': { name: 'Classifying Shapes by Properties', category: 'Geometry' },
  'act-percent-applications': { name: 'Percent Applications', category: 'Integrating Essential Skills' },
  'volume-rectangular-prisms': { name: 'Volume of Rectangular Prisms', category: 'Geometry' },
  'identify-shapes': { name: 'Identify Shapes', category: 'Geometry' },
  MS_EQV_10: { name: 'Order of operations with exponents', category: 'Expressions & Equations' },
};

// "Jason": placement + legacy seed "mastery", two practiced skills, and an FSRS
// store still carrying the pre-ad442ada "undefined" key.
const jason = {
  skillMastery: new Map([
    ['act-percent-applications', { status: 'mastered', provenBy: 'placement', rung: 'proved', totalAttempts: 0, masteryType: 'verified' }],
    ['addition-within-100', { status: 'mastered', totalAttempts: 0, masteryType: 'verified' }],
    ['classify-shapes', { status: 'mastered', totalAttempts: 0, masteryType: 'verified' }],
    ['identify-shapes', { status: 'ready', totalAttempts: 0 }],
    ['volume-rectangular-prisms', { status: 'learning', totalAttempts: 0 }],
    ['act-sequences', { status: 'learning', provenBy: 'lesson', totalAttempts: 53, masteryScore: 29, lastPracticed: daysAgo(1) }],
    ['function-basics', { status: 'learning', provenBy: 'lesson', totalAttempts: 4, masteryScore: 40, lastPracticed: daysAgo(3) }],
  ]),
  fsrs: {
    undefined: { stability: 0.1, lastReview: daysAgo(90) },
    'act-sequences': { stability: 4, lastReview: daysAgo(1) },
  },
};

describe('classifySkill', () => {
  test('placement and inferred are placed out, whatever the status', () => {
    expect(classifySkill({ status: 'mastered', provenBy: 'placement' })).toBe('placed');
    expect(classifySkill({ status: 'mastered', masteryType: 'inferred', totalAttempts: 0 })).toBe('placed');
  });
  test('"mastered" with no attempts and no provenance is not earned mastery', () => {
    expect(classifySkill({ status: 'mastered', totalAttempts: 0 })).toBe('placed');
  });
  test('attempts or a practice provenance make it practiced', () => {
    expect(classifySkill({ status: 'learning', totalAttempts: 3 })).toBe('practiced');
    expect(classifySkill({ status: 'mastered', provenBy: 'challenge' })).toBe('practiced');
    expect(classifySkill({ status: 'learning', pillars: { accuracy: { total: 2 } } })).toBe('practiced');
  });
  test('untouched entries are not started', () => {
    expect(classifySkill({ status: 'ready', totalAttempts: 0 })).toBe('not-started');
    expect(classifySkill({ status: 'learning', totalAttempts: 0 })).toBe('not-started');
  });
});

describe('buildSkillPicture — the "Jason" account', () => {
  const p = buildSkillPicture({ skillMastery: jason.skillMastery, fsrs: jason.fsrs, info: INFO, now: NOW });

  test('counts only practiced skills as mastered / in progress; placement is separate', () => {
    expect(p.counts).toEqual({ practiced: 2, practicedMastered: 0, learning: 2, needsReview: 0, placedOut: 3 });
  });

  test('top strengths never include placed-out or never-practiced K-5 skills', () => {
    expect(p.topStrengths).toEqual([]);
  });

  test('the "undefined" FSRS key is gone from memory, and memory counts the one real card', () => {
    expect(p.memory.tracked).toBe(1);
    expect(p.memory.skills.map((m) => m.name)).toEqual(['Sequences']);
  });

  test('nothing a parent reads contains undefined/null or a raw skill id', () => {
    const texts = [
      ...p.topStrengths.map((s) => s.name),
      ...p.growthAreas.map((s) => s.name),
      ...p.memory.skills.map((s) => s.name),
      ...p.categories.map((c) => c.name),
    ];
    for (const t of texts) expect(isLeak(t)).toBe(false);
  });
});

describe('buildSkillPicture — the "Jayden" account', () => {
  test('18 placement "mastered" with zero practice reads as 0 practiced, 18 placed out', () => {
    const sm = {};
    for (let i = 0; i < 18; i++) sm[`act-skill-${i}`] = { status: 'mastered', provenBy: 'placement', rung: 'proved', totalAttempts: 0 };
    const p = buildSkillPicture({ skillMastery: sm, fsrs: {}, info: {}, now: NOW });
    expect(p.counts.practicedMastered).toBe(0);
    expect(p.counts.practiced).toBe(0);
    expect(p.counts.placedOut).toBe(18);
    expect(p.topStrengths).toEqual([]);
  });
});

describe('one needs-review number', () => {
  test('mastery needs-review and memory needs-review fold into one count without double-counting', () => {
    const sm = {
      MS_EQV_10: { status: 'needs-review', totalAttempts: 9, lastPracticed: daysAgo(40) },
      'function-basics': { status: 'mastered', totalAttempts: 12, lastPracticed: daysAgo(60) },
    };
    const fsrs = {
      // the same skill as MS_EQV_10, keyed by its legacy id — must not count twice
      'order-of-operations': { stability: 0.5, lastReview: daysAgo(40) },
      'function-basics': { stability: 0.5, lastReview: daysAgo(60) },
    };
    const info = { ...INFO, 'order-of-operations': { name: 'Order of operations with exponents', category: 'Expressions & Equations' } };
    const p = buildSkillPicture({ skillMastery: sm, fsrs, info, now: NOW });
    expect(p.counts.needsReview).toBe(2); // MS.EQV.10 (both stores) + function-basics (memory)
    expect(p.memory.needsReview).toBe(2);
    expect(p.growthAreas.map((g) => g.name).sort()).toEqual(['Function Basics', 'Order of operations with exponents']);
  });
});

describe('strengths are earned and recent', () => {
  test('ranked by last practice, not by score', () => {
    const sm = {
      'addition-within-100': { status: 'mastered', totalAttempts: 30, masteryScore: 100, lastPracticed: daysAgo(200) },
      'function-basics': { status: 'mastered', totalAttempts: 10, masteryScore: 86, lastPracticed: daysAgo(2) },
    };
    const p = buildSkillPicture({ skillMastery: sm, fsrs: {}, info: INFO, now: NOW });
    expect(p.topStrengths.map((s) => s.name)).toEqual(['Function Basics', 'Addition Within 100']);
  });

  test('a skill whose name cannot be resolved is left out rather than shown as an id', () => {
    const p = buildSkillPicture({ skillMastery: { 'mystery-skill': { status: 'mastered', totalAttempts: 5 } }, fsrs: {}, info: {}, now: NOW });
    expect(p.topStrengths).toEqual([]);
  });
});
