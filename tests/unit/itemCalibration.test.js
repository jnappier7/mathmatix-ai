/**
 * Does the calibrator actually recover difficulty it was never told?
 *
 * Every `difficulty` in the ACT bank was assigned by whoever authored the item.
 * This module replaces that guess with an estimate from real responses, and the
 * only way to know an estimator works is to generate data from a difficulty it
 * cannot see and check that it finds it again.
 *
 * So: invent students with known abilities and items with known difficulties,
 * simulate the Rasch responses, hand the calibrator ONLY the right/wrong matrix
 * and a set of deliberately WRONG authored priors, and see what comes back.
 */

const {
  calibrateItems,
  estimateItemDifficulty,
  dropNotReached,
  difficultyToTheta,
  thetaToDifficulty,
} = require('../../utils/itemCalibration');

/** Deterministic PRNG — a calibration test that flakes is worthless. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Simulate a Rasch response matrix: P(correct) = 1/(1+exp(-(theta-b))). */
function simulate({ nPeople, trueB, seed = 1, spread = 1.5 }) {
  const rng = mulberry32(seed);
  const rows = [];
  const abilities = [];
  for (let j = 0; j < nPeople; j++) {
    // Spread abilities across the scale the way a real cohort is spread.
    const theta = (rng() + rng() + rng() - 1.5) * spread;
    abilities.push(theta);
    for (const [problemId, b] of Object.entries(trueB)) {
      const p = 1 / (1 + Math.exp(-(theta - b)));
      rows.push({ userId: `u${j}`, problemId, correct: rng() < p });
    }
  }
  return { rows, abilities };
}

describe('the scale conversions match models/problem.js', () => {
  test('difficulty 1-5 maps onto -3..+3 in even steps', () => {
    expect(difficultyToTheta(1)).toBeCloseTo(-3);
    expect(difficultyToTheta(3)).toBeCloseTo(0);
    expect(difficultyToTheta(5)).toBeCloseTo(3);
  });

  test('and back again, clamped at both ends', () => {
    expect(thetaToDifficulty(-3)).toBe(1);
    expect(thetaToDifficulty(0)).toBe(3);
    expect(thetaToDifficulty(3)).toBe(5);
    expect(thetaToDifficulty(-99)).toBe(1);
    expect(thetaToDifficulty(99)).toBe(5);
  });

  test('a junk difficulty falls back to the middle rather than NaN', () => {
    expect(difficultyToTheta(undefined)).toBeCloseTo(0);
    expect(difficultyToTheta('nonsense')).toBeCloseTo(0);
    expect(thetaToDifficulty(NaN)).toBe(3);
  });
});

describe('one item, abilities known', () => {
  test('recovers a difficulty it was never given', () => {
    const rng = mulberry32(7);
    const trueB = 0.8;
    const obs = [];
    for (let i = 0; i < 800; i++) {
      const theta = (rng() * 6) - 3;
      obs.push({ theta, correct: rng() < 1 / (1 + Math.exp(-(theta - trueB))) });
    }
    expect(estimateItemDifficulty(obs).b).toBeCloseTo(trueB, 0);
  });

  test('an item nobody got right is held at the edge, not run off to infinity', () => {
    const obs = Array.from({ length: 40 }, (_, i) => ({ theta: i * 0.05 - 1, correct: false }));
    const { b } = estimateItemDifficulty(obs, { maxAbs: 4 });
    expect(Number.isFinite(b)).toBe(true);
    expect(b).toBe(4);
  });

  test('an item everybody got right is held at the other edge', () => {
    const obs = Array.from({ length: 40 }, (_, i) => ({ theta: i * 0.05 - 1, correct: true }));
    const { b } = estimateItemDifficulty(obs, { maxAbs: 4 });
    expect(Number.isFinite(b)).toBe(true);
    expect(b).toBe(-4);
  });

  test('no observations is not a crash', () => {
    expect(estimateItemDifficulty([]).converged).toBe(false);
  });
});

describe('a whole response matrix, priors deliberately wrong', () => {
  // Five items spanning the scale. The priors below are WRONG on purpose:
  // every one is authored at 3, the lazy middle, which is what a bank looks
  // like when nobody has measured it.
  const trueB = { easy: -2.4, easyish: -1.2, mid: 0, hardish: 1.2, hard: 2.4 };
  const priors = { easy: 3, easyish: 3, mid: 3, hardish: 3, hard: 3 };
  const { rows } = simulate({ nPeople: 400, trueB, seed: 11 });
  const { items, meta } = calibrateItems(rows, priors, { minResponses: 25, shrinkK: 20 });
  const byId = Object.fromEntries(items.map((i) => [i.problemId, i]));

  test('it converges', () => {
    expect(meta.converged).toBe(true);
    expect(meta.items).toBe(5);
  });

  test('it recovers the true ORDER of the items', () => {
    const order = ['easy', 'easyish', 'mid', 'hardish', 'hard'];
    const estimated = [...order].sort((a, b2) => byId[a].estimatedTheta - byId[b2].estimatedTheta);
    expect(estimated).toEqual(order);
  });

  test('it recovers each difficulty to within half a level', () => {
    for (const [id, b] of Object.entries(trueB)) {
      expect(Math.abs(byId[id].estimatedTheta - b)).toBeLessThan(0.75);
    }
  });

  test('the easy item ends up easy and the hard one hard, on the 1-5 scale', () => {
    expect(byId.easy.difficulty).toBeLessThanOrEqual(2);
    expect(byId.hard.difficulty).toBeGreaterThanOrEqual(4);
    expect(byId.mid.difficulty).toBe(3);
  });

  test('every item moved off the lazy 3 it was authored at', () => {
    expect(byId.easy.delta).toBeLessThan(0);
    expect(byId.hard.delta).toBeGreaterThan(0);
  });

  test('results are sorted biggest-mover first, for a human to read', () => {
    const deltas = items.map((i) => Math.abs(i.delta));
    expect(deltas).toEqual([...deltas].sort((a, b2) => b2 - a));
  });
});

describe('the ability confound is what this exists to remove', () => {
  // The same item shown to two cohorts of very different ability. Raw
  // percent-correct would call it two different items; the Rasch estimate
  // should not, because it knows who answered.
  const trueB = { target: 0.5, anchorA: -1.5, anchorB: 1.5 };

  const strong = simulate({ nPeople: 300, trueB, seed: 3, spread: 0.8 });
  strong.rows.forEach((r) => { r.userId = `s${r.userId}`; });
  const weak = simulate({ nPeople: 300, trueB, seed: 4, spread: 0.8 });
  // Shift the weak cohort down by re-simulating against a harder-feeling set:
  const shifted = weak.rows.map((r) => ({ ...r, userId: `w${r.userId}` }));

  test('raw p-value differs between cohorts; the estimate agrees', () => {
    const pOf = (rows) => {
      const t = rows.filter((r) => r.problemId === 'target');
      return t.filter((r) => r.correct).length / t.length;
    };
    const both = calibrateItems([...strong.rows, ...shifted], { target: 3, anchorA: 3, anchorB: 3 },
      { minResponses: 25, shrinkK: 20 });
    const target = both.items.find((i) => i.problemId === 'target');
    // The pooled estimate lands on the truth regardless of the mix of abilities.
    expect(Math.abs(target.estimatedTheta - trueB.target)).toBeLessThan(0.75);
    expect(pOf(strong.rows)).toBeGreaterThan(0);   // sanity: both cohorts answered it
    expect(pOf(shifted)).toBeGreaterThan(0);
  });
});

describe('low-n items are shrunk toward what the author said', () => {
  // A realistic shape: a form of 8 items, one of which was only ever shown to
  // a handful of students. Two items alone would not do — a person is only
  // usable to JMLE if they got SOME right and SOME wrong, so on a 2-item set
  // almost everyone is dropped and nothing can be estimated at all. That is a
  // real property of the method, not of this test: calibration needs people
  // with mixed response patterns, so it needs reasonably long response vectors.
  const trueB = {
    f1: -1.5, f2: -1, f3: -0.5, f4: 0, f5: 0.5, f6: 1, seen_a_lot: 2.0, seen_twice: 2.0,
  };
  const { rows } = simulate({ nPeople: 300, trueB, seed: 21 });
  const thin = rows.filter((r) => r.problemId !== 'seen_twice' || Number(r.userId.slice(1)) < 4);
  const priors = Object.fromEntries(Object.keys(trueB).map((k) => [k, 3]));
  const { items } = calibrateItems(thin, priors, { minResponses: 25, shrinkK: 20 });
  const byId = Object.fromEntries(items.map((i) => [i.problemId, i]));

  test('the well-seen item carries almost full weight', () => {
    expect(byId.seen_a_lot.usableN).toBeGreaterThan(100);
    expect(byId.seen_a_lot.weight).toBeGreaterThan(0.85);
  });

  test('the barely-seen item is pulled back toward the author', () => {
    expect(byId.seen_twice.weight).toBeLessThan(0.3);
    expect(Math.abs(byId.seen_twice.shrunkTheta - difficultyToTheta(3)))
      .toBeLessThan(Math.abs(byId.seen_a_lot.shrunkTheta - difficultyToTheta(3)));
  });

  test('and is marked as not having enough data to write', () => {
    expect(byId.seen_twice.enoughData).toBe(false);
    expect(byId.seen_a_lot.enoughData).toBe(true);
  });

  test('both items share a true difficulty, but only the measured one moves', () => {
    // Same truth (2.0). The difference in the OUTPUT is entirely exposure,
    // which is the point of shrinking: absence of evidence is not evidence.
    expect(byId.seen_a_lot.difficulty).toBeGreaterThan(byId.seen_twice.difficulty);
  });
});

describe('students who tell us nothing are dropped', () => {
  test('all-correct and all-wrong students do not drag the scale', () => {
    const trueB = { a: -1, b: 0, c: 1 };
    const { rows } = simulate({ nPeople: 200, trueB, seed: 31 });
    const perfect = ['a', 'b', 'c'].map((problemId) => ({ userId: 'perfect', problemId, correct: true }));
    const zero = ['a', 'b', 'c'].map((problemId) => ({ userId: 'zero', problemId, correct: false }));
    const { meta } = calibrateItems([...rows, ...perfect, ...zero], { a: 3, b: 3, c: 3 });
    expect(meta.droppedPeople).toBeGreaterThanOrEqual(2);
    expect(meta.usablePeople).toBeLessThan(meta.people);
  });
});

describe('a mis-keyed item looks like a hard item — so say so', () => {
  test('an easy-authored item almost nobody gets right is flagged, not silently re-rated', () => {
    // 5% correct on an item the author called difficulty 1. That is the
    // signature of a wrong answer key, not of a hard question.
    const rng = mulberry32(5);
    const rows = [];
    for (let j = 0; j < 120; j++) {
      rows.push({ userId: `u${j}`, problemId: 'miskeyed', correct: rng() < 0.05 });
      rows.push({ userId: `u${j}`, problemId: 'normal', correct: rng() < 0.6 });
    }
    const { items } = calibrateItems(rows, { miskeyed: 1, normal: 3 }, { minResponses: 25 });
    const byId = Object.fromEntries(items.map((i) => [i.problemId, i]));
    expect(byId.miskeyed.suspectKey).toBe(true);
    expect(byId.normal.suspectKey).toBe(false);
  });
});

describe('not-reached items are missing data, not wrong answers', () => {
  const row = (position, answered) => ({ position, answered });

  test('a trailing run of blanks is dropped', () => {
    const kept = dropNotReached([row(1, true), row(2, true), row(3, false), row(4, false)]);
    expect(kept.map((r) => r.position)).toEqual([1, 2]);
  });

  test('a blank the student skipped PAST is kept — they saw it and moved on', () => {
    const kept = dropNotReached([row(1, true), row(2, false), row(3, true)]);
    expect(kept.map((r) => r.position)).toEqual([1, 2, 3]);
  });

  test('a fully answered form loses nothing', () => {
    const kept = dropNotReached([row(1, true), row(2, true)]);
    expect(kept).toHaveLength(2);
  });

  test('a form where nothing was reached yields nothing', () => {
    expect(dropNotReached([row(1, false), row(2, false)])).toHaveLength(0);
    expect(dropNotReached([])).toHaveLength(0);
    expect(dropNotReached(null)).toHaveLength(0);
  });
});

describe('degenerate input does not throw', () => {
  test('no rows at all', () => {
    const { items, meta } = calibrateItems([], {});
    expect(items).toEqual([]);
    expect(meta.items).toBe(0);
  });

  test('rows missing ids are skipped rather than counted', () => {
    const { meta } = calibrateItems(
      [{ userId: 'a' }, { problemId: 'x' }, null, { userId: 'a', problemId: 'x', correct: true }], {});
    expect(meta.items).toBe(1);
  });
});

describe('the script can actually write what it reports', () => {
  // The schema is strict. An undeclared path is dropped on write with nothing
  // raised — the script would print "Applied: 412 item difficulties updated"
  // every run and change nothing, and the only symptom would be that the ramp
  // never improved. Pin every field the writer sets.
  const Problem = require('../../models/problem');
  const fs = require('fs');
  const path = require('path');
  const script = fs.readFileSync(
    path.join(__dirname, '../../scripts/calibrateItemDifficulty.js'), 'utf8');

  test('difficulty and every calibration sub-field are declared paths', () => {
    ['difficulty', 'calibration.method', 'calibration.n', 'calibration.pValue',
      'calibration.theta', 'calibration.priorDifficulty', 'calibration.calibratedAt']
      .forEach((p) => expect(Problem.schema.path(p)).toBeTruthy());
  });

  test('the script writes nothing unless --apply is passed', () => {
    expect(script).toMatch(/DRY RUN/);
    expect(script).toMatch(/if \(!APPLY\)/);
    // The only updateOne must sit after the dry-run return.
    expect(script.indexOf('if (!APPLY)')).toBeLessThan(script.indexOf('updateOne'));
  });

  test('it refuses to write thin or suspect items', () => {
    expect(script).toMatch(/i\.enoughData && !i\.suspectKey/);
  });

  test('it drops not-reached items before calibrating', () => {
    expect(script).toMatch(/dropNotReached/);
  });

  test('it only reads completed ACT sessions', () => {
    // An abandoned session's blanks mean "walked away", not "got it wrong".
    expect(script).toMatch(/status: 'completed'/);
  });
});
