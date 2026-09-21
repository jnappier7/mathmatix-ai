/**
 * The practice test has to be shaped like the real one.
 *
 * The principle this file was written to defend is right and unchanged: pin
 * ACT's published shares so a bank shortage can never quietly re-balance the
 * exam. The NUMBERS it pinned were wrong.
 *
 * It asserted "Integrating Essential Skills is 40-43% of the real test --
 * nearly half", and drove the blueprint to 19 of 45 (42%). That is the LEGACY
 * 60-question ACT's IES share. The enhanced (2025+) 45-question section splits
 * 80/20: ACT's own "Preparing for the ACT" ((c) 2026) states Preparing for
 * Higher Math 80% (N&Q 10-12%, Algebra 17-20%, Functions 17-20%, Geometry
 * 17-20%, Stats & Prob 12-15%) and Integrating Essential Skills 20%. Both
 * official practice forms score IES at exactly 8 of 41 scored items (19.5%).
 *
 * So the file had it backwards in the most costly way: it read 9/45 (the
 * correct weight) as evidence of a bank compromise and "corrected" it to 19,
 * citing the 300-item IES expansion as licence. Supply reshaped the instrument.
 * Two effects on a real student, both observed: 42% of every form came from the
 * six IES skills, so the same skill appeared 3-4 times per test; and every
 * other category was starved to 6 or 4 slots, well under its published band.
 *
 * Depth is the other half, and it was never the constraint it was claimed to
 * be -- at the correct weights the bank supports MORE fresh forms (18) than it
 * did at the inflated ones, because the PHM banks stop being rationed.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { buildSlots } = require('../../utils/actTestAssembler');

const ROOT = path.join(__dirname, '../..');
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const blueprint = read('seeds/act-math-blueprint.json');

// Official ACT math reporting-category shares for the enhanced 45-question
// section, verbatim from Preparing for the ACT ((c) 2026), "Mathematics Test".
// IES is stated as a single figure (20%), not a band.
const OFFICIAL = {
  'integrating-essential-skills': [20, 20],
  'number-quantity': [10, 12],
  algebra: [17, 20],
  functions: [17, 20],
  geometry: [17, 20],
  'statistics-probability': [12, 15],
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

  test('Integrating Essential Skills carries its real weight — 20%, not 42%', () => {
    // Guards BOTH directions. Downward: a thin bank must not buy slack by
    // shaving the hardest category to author. Upward: a DEEP IES bank must not
    // buy itself slots either, which is the direction that actually happened.
    expect(weights['integrating-essential-skills']).toBe(9);
    expect(Object.keys(OFFICIAL).sort()).toEqual(Object.keys(weights).sort());
  });

  test('Preparing for Higher Math totals 80%', () => {
    const phm = total - weights['integrating-essential-skills'];
    expect((100 * phm) / total).toBeCloseTo(80, 0);
  });

  test('the raw→scale curve is ACT\'s published one, not a hand-drawn line', () => {
    // ACT's Mathematics Scale Score Conversion Table for a 41-scored-item form
    // (Preparing for the ACT, (c) 2026), at four anchor points, projected onto
    // this form's 45 slots. The previous hand-made curve ran ~2 points generous
    // across the 30-50%-correct band and ~2 harsh above 80%: it flattered
    // struggling students and under-credited strong ones, in a product whose
    // entire payoff is a believable score delta.
    const t = blueprint.scaledScore.scaledByRaw;
    expect(t).toHaveLength(total + 1);
    expect(t[0]).toBe(1);
    expect(t[total]).toBe(36);
    [[0.30, 15], [0.50, 20], [0.80, 30]].forEach(([pct, expected]) => {
      expect(Math.abs(t[Math.round(pct * total)] - expected)).toBeLessThanOrEqual(1);
    });
    for (let i = 1; i <= total; i++) expect(t[i]).toBeGreaterThanOrEqual(t[i - 1]);
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

  test('correcting the weights did not cost form depth', () => {
    // The 19-slot IES blueprint was defended as the one the bank could support.
    // It was the opposite: rationing PHM to 6/6/6/4/4 slots made the PHM banks
    // the binding constraint. At the published shares every category clears 15
    // fresh forms and the weakest link is Stats & Probability at ~18.
    const depths = Object.entries(weights).map(([cat, slots]) => Math.floor((perCat[cat] || 0) / slots));
    expect(Math.min(...depths)).toBeGreaterThanOrEqual(15);
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
    // A real ACT does not block by topic. At the old 19-of-45 IES weight the
    // measured ceiling was 4; at the published shares no category is dense
    // enough to run long and the measured ceiling over 3,000 forms is 2. A
    // pure shuffle of the same slots reaches 10, so this still catches a
    // future change that blocks by topic — with one slot of slack.
    for (let s = 0; s < 200; s++) {
      const slots = buildSlots(blueprint, mulberry32(s * 40503 + 7));
      let run = 1; let longest = 1;
      for (let i = 1; i < slots.length; i++) {
        run = slots[i].category === slots[i - 1].category ? run + 1 : 1;
        longest = Math.max(longest, run);
      }
      expect(longest).toBeLessThanOrEqual(3);
    }
  });

  test('no skill is asked more than twice in one form', () => {
    // The owner's report that started this: "some questions may have covered
    // the same skill". At IES 19/45 over six skills, buildSlots' round-robin
    // GUARANTEED 3-4 questions on every IES skill, every form. At 9 slots over
    // the same six it is at most 2, and 2 is the hard ceiling across all
    // categories (measured over 3,000 forms).
    for (let s = 0; s < 50; s++) {
      const slots = buildSlots(blueprint, mulberry32(s * 91711 + 13));
      const bySkill = {};
      slots.forEach((sl) => { bySkill[sl.skillId] = (bySkill[sl.skillId] || 0) + 1; });
      Object.values(bySkill).forEach((n) => expect(n).toBeLessThanOrEqual(2));
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
    expect(DEFAULT_CATEGORY_WEIGHTS['integrating-essential-skills']).toBe(9);
  });

  test('the bootcamp plan reads the blueprint too', () => {
    const src = fs.readFileSync(path.join(ROOT, 'utils/actBootcampPlan.js'), 'utf8');
    expect(src).toMatch(/DEFAULT_BLUEPRINT\)\.categoryWeights/);
  });
});
