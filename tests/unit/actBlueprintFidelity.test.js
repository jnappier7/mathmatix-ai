/**
 * The practice test has to be shaped like the real one.
 *
 * ACT publishes the composition of its math section as reporting-category
 * shares, and a practice form that drifts from them trains the wrong mix:
 * Integrating Essential Skills is 40-43% of the real test -- nearly half --
 * and our blueprint carried it at 20% (9 of 45) because the item bank could
 * not support more. That is a bank constraint leaking into the measurement
 * instrument, so pin the shares here and let the test fail loudly if a future
 * bank shortage tempts someone to quietly re-balance the exam instead.
 *
 * Depth is the other half: raising a weight past what the bank can fill makes
 * assembleForm emit `gaps` and, once the no-repeat ledger is deep enough,
 * return 409 exhausted to a student mid-bootcamp.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { buildSlots } = require('../../utils/actTestAssembler');

const ROOT = path.join(__dirname, '../..');
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const blueprint = read('seeds/act-math-blueprint.json');

// Official ACT math reporting-category shares (percent of the section).
const OFFICIAL = {
  'integrating-essential-skills': [40, 43],
  'number-quantity': [7, 10],
  algebra: [12, 15],
  functions: [12, 15],
  geometry: [12, 15],
  'statistics-probability': [8, 12],
};

const total = blueprint.totalItems;
const weights = blueprint.categoryWeights;

describe('the blueprint matches the real ACT composition', () => {
  test('the section is 45 items in 50 minutes with 4 choices', () => {
    expect(total).toBe(45);
    expect(blueprint.timeLimitMinutes).toBe(50);
    expect(blueprint.choicesPerItem).toBe(4);
  });

  test('the category slots sum to the section length', () => {
    expect(Object.values(weights).reduce((a, b) => a + b, 0)).toBe(total);
  });

  test('every category share falls inside ACT\'s published range', () => {
    Object.entries(OFFICIAL).forEach(([cat, [lo, hi]]) => {
      const share = (100 * weights[cat]) / total;
      expect(share).toBeGreaterThanOrEqual(lo);
      expect(share).toBeLessThanOrEqual(hi);
    });
  });

  test('Integrating Essential Skills carries its real weight', () => {
    // The single share most likely to be quietly traded away for bank depth:
    // IES is the multi-step synthesis half of the exam and the hardest to
    // author, so it is the first thing a thin bank pressures downward.
    expect(weights['integrating-essential-skills']).toBe(19);
    expect(Object.keys(OFFICIAL).sort()).toEqual(Object.keys(weights).sort());
  });

  test('Preparing for Higher Math totals 57-60%', () => {
    const phm = total - weights['integrating-essential-skills'];
    const share = (100 * phm) / total;
    expect(share).toBeGreaterThanOrEqual(57);
    expect(share).toBeLessThanOrEqual(60);
  });
});

describe('the item bank can actually fill the blueprint', () => {
  const bank = [
    ...read('seeds/act-fable-items.generated.json'),
    ...JSON.parse(zlib.gunzipSync(fs.readFileSync(
      path.join(ROOT, 'seeds/low-volume-expansion/act-items.generated.json.gz'))).toString('utf8')),
    ...read('seeds/act-ies-expansion/ies-items.generated.json'),
  ];
  const skillToCat = {};
  Object.entries(blueprint.skillsByCategory).forEach(([cat, skills]) => {
    skills.forEach((s) => { skillToCat[s] = cat; });
  });
  const perCat = {};
  bank.forEach((b) => {
    const c = skillToCat[b.skillId];
    if (c) perCat[c] = (perCat[c] || 0) + 1;
  });

  test('every category supports at least 10 non-repeating forms', () => {
    // The bootcamp is a repeat-until-you-improve loop; a student who tests
    // every couple of weeks should not exhaust a category in a term.
    Object.entries(weights).forEach(([cat, slots]) => {
      expect(Math.floor((perCat[cat] || 0) / slots)).toBeGreaterThanOrEqual(10);
    });
  });

  test('no category is oversubscribed relative to IES depth', () => {
    // IES is the deepest ask (19 slots); it must not be the thing that
    // starves first now that its weight went up.
    const ies = Math.floor(perCat['integrating-essential-skills'] / weights['integrating-essential-skills']);
    expect(ies).toBeGreaterThanOrEqual(15);
  });
});

describe('assembled forms honor the blueprint', () => {
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  test('slot counts per category match the weights, on many seeds', () => {
    for (let s = 0; s < 50; s++) {
      const slots = buildSlots(blueprint, mulberry32(s * 2654435761 + 1));
      expect(slots).toHaveLength(total);
      const counts = {};
      slots.forEach((sl) => { counts[sl.category] = (counts[sl.category] || 0) + 1; });
      expect(counts).toEqual(weights);
    }
  });

  test('categories stay interleaved — no long single-category run', () => {
    // A real ACT does not block by topic, but it does put same-category items
    // next to each other, and at 19-of-45 IES is dense enough that short runs
    // are expected rather than a defect. Measured over 2,000 forms, buildSlots'
    // even-spread placement yields a longest run of 2 (36%), 3 (61%), or 4 (3%)
    // and never more; a pure shuffle of the same slots reaches 10. So 4 is the
    // real ceiling of the current algorithm — this guards against a future
    // change that blocks by topic, not against ordinary density.
    for (let s = 0; s < 200; s++) {
      const slots = buildSlots(blueprint, mulberry32(s * 40503 + 7));
      let run = 1; let longest = 1;
      for (let i = 1; i < slots.length; i++) {
        run = slots[i].category === slots[i - 1].category ? run + 1 : 1;
        longest = Math.max(longest, run);
      }
      expect(longest).toBeLessThanOrEqual(4);
    }
  });

  test('no skill is asked more than a few times in one form', () => {
    for (let s = 0; s < 50; s++) {
      const slots = buildSlots(blueprint, mulberry32(s * 91711 + 13));
      const bySkill = {};
      slots.forEach((sl) => { bySkill[sl.skillId] = (bySkill[sl.skillId] || 0) + 1; });
      Object.values(bySkill).forEach((n) => expect(n).toBeLessThanOrEqual(4));
    }
  });
});

describe('nothing keeps a private copy of the exam shape', () => {
  test('the review queue ranks misses by the blueprint\'s own weights', () => {
    // actReview held a hardcoded duplicate of categoryWeights. A blueprint
    // change would then leave the review queue ordering misses by the retired
    // exam shape with nothing failing -- the student would just be walked
    // through their misses in a slightly wrong priority forever.
    const { DEFAULT_CATEGORY_WEIGHTS } = require('../../utils/actReview');
    expect(DEFAULT_CATEGORY_WEIGHTS).toEqual(blueprint.categoryWeights);
    expect(DEFAULT_CATEGORY_WEIGHTS['integrating-essential-skills']).toBe(19);
  });

  test('the bootcamp plan reads the blueprint too', () => {
    const src = fs.readFileSync(path.join(ROOT, 'utils/actBootcampPlan.js'), 'utf8');
    expect(src).toMatch(/DEFAULT_BLUEPRINT\)\.categoryWeights/);
  });
});
