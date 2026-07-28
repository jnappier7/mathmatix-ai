/**
 * A bad day must not cost a student their level.
 *
 * A Growth Check is 5-8 items, and it writes the ability estimate, the level
 * string, AND user.mathCourse (the pathway the tutor teaches from) — then locks
 * the student out for three months. So one rushed, misclicked, or
 * handed-to-a-sibling run could drop someone from Algebra 1 to 6th Grade and
 * leave the tutor teaching a quarter below where they actually are.
 *
 * The guard is deliberately asymmetric: growth is trusted in full (correct
 * answers at difficulty have one cause), drops are throttled (wrong answers
 * have many). It SLOWS a decline rather than blocking one.
 */

const {
  dampGrowthCheckDrop,
  oneBandDownFloor,
  UNCONVERGED_SE,
} = require('../../utils/growthGuard');
const { thetaToGradeLevel } = require('../../utils/catConfig');

const levelOf = (theta) => thetaToGradeLevel(theta).gradeLevel;

describe('growth is trusted in full', () => {
  test('a big jump up is applied exactly as measured', () => {
    const r = dampGrowthCheckDrop({ previousTheta: 0.2, measuredTheta: 1.4, measuredSE: 0.35 });
    expect(r.theta).toBe(1.4);
    expect(r.damped).toBe(false);
    expect(r.reason).toBe('accepted');
    expect(r.appliedLevel).toBe('Geometry');
  });

  test('an unconverged check is NOT throttled on the way up', () => {
    // The SE gate exists to distrust the MAGNITUDE of a drop. You cannot fake
    // correct answers at difficulty, so upward evidence stands on its own.
    const r = dampGrowthCheckDrop({ previousTheta: 0.2, measuredTheta: 1.4, measuredSE: 0.9 });
    expect(r.theta).toBe(1.4);
    expect(r.damped).toBe(false);
  });

  test('no change is left alone', () => {
    const r = dampGrowthCheckDrop({ previousTheta: 0.75, measuredTheta: 0.75, measuredSE: 0.3 });
    expect(r.theta).toBe(0.75);
    expect(r.damped).toBe(false);
  });
});

describe('THE case this exists for: one bad check must not tank the level', () => {
  test('Algebra 1 → 6th Grade in one check is capped at one band down', () => {
    const r = dampGrowthCheckDrop({ previousTheta: 1.1, measuredTheta: 0.15, measuredSE: 0.35 });

    expect(r.previousLevel).toBe('Algebra 1');
    expect(r.rawLevel).toBe('6th Grade');      // what the check said
    expect(r.appliedLevel).toBe('8th Grade');  // exactly one band down
    expect(r.damped).toBe(true);
    expect(r.reason).toContain('level-floor');
    // The honest reading is preserved for teachers.
    expect(r.rawTheta).toBe(0.15);
  });

  test('the applied theta really does land in the band below — not two below', () => {
    // Bands are half-open, so flooring exactly on the boundary would land in
    // the band beneath it and quietly defeat the whole rule.
    for (const prev of [1.1, 0.8, 0.5, 0.25, -0.2, -0.7, -1.2, -1.7, 2.4, 2.9]) {
      const r = dampGrowthCheckDrop({ previousTheta: prev, measuredTheta: prev - 5, measuredSE: 0.3 });
      const bands = ['Kindergarten', '1st Grade', '2nd Grade', '3rd Grade', '4th Grade', '5th Grade',
        '6th Grade', '7th Grade', '8th Grade', 'Algebra 1', 'Geometry', 'Algebra 2',
        'Pre-Calculus', 'Calculus', 'Advanced Math'];
      const prevIdx = bands.indexOf(levelOf(prev));
      const appliedIdx = bands.indexOf(r.appliedLevel);
      // Kindergarten and 1st Grade have nothing (or nothing bounded) below.
      if (prevIdx >= 2) {
        expect(appliedIdx).toBe(prevIdx - 1);
      }
    }
  });

  test('a modest honest dip inside the same band passes through untouched', () => {
    const r = dampGrowthCheckDrop({ previousTheta: 1.1, measuredTheta: 0.95, measuredSE: 0.3 });
    expect(r.theta).toBe(0.95);
    expect(r.damped).toBe(false);
    expect(r.appliedLevel).toBe('Algebra 1');
  });
});

describe('an unconverged check earns only part of its drop', () => {
  test('SE above the threshold halves the drop', () => {
    const r = dampGrowthCheckDrop({ previousTheta: 1.0, measuredTheta: 0.8, measuredSE: 0.9 });
    // drop of 0.2 → 0.1 applied
    expect(r.theta).toBeCloseTo(0.9, 5);
    expect(r.reason).toBe('low-confidence');
    expect(r.damped).toBe(true);
  });

  test('a converged check of the same size is applied in full', () => {
    const r = dampGrowthCheckDrop({ previousTheta: 1.0, measuredTheta: 0.8, measuredSE: 0.3 });
    expect(r.theta).toBe(0.8);
    expect(r.damped).toBe(false);
  });

  test('the threshold is the documented one, not an accident', () => {
    const just_under = dampGrowthCheckDrop({ previousTheta: 1.0, measuredTheta: 0.8, measuredSE: UNCONVERGED_SE });
    const just_over = dampGrowthCheckDrop({ previousTheta: 1.0, measuredTheta: 0.8, measuredSE: UNCONVERGED_SE + 0.01 });
    expect(just_under.damped).toBe(false);
    expect(just_over.damped).toBe(true);
  });

  test('a missing SE is not treated as an unconverged check', () => {
    const r = dampGrowthCheckDrop({ previousTheta: 1.0, measuredTheta: 0.8 });
    expect(r.theta).toBe(0.8);
    expect(r.reason).toBe('accepted');
  });

  test('levelHeld is set when the throttle keeps them in their own band', () => {
    // Raw (0.85) sits one band down; halving the 0.15 drop keeps them at 0.925,
    // still inside Algebra 1 — so their level never moved.
    const r = dampGrowthCheckDrop({ previousTheta: 1.0, measuredTheta: 0.85, measuredSE: 0.9 });
    expect(r.rawLevel).toBe('8th Grade');
    expect(r.appliedLevel).toBe('Algebra 1');
    expect(r.levelHeld).toBe(true);
  });

  test('levelHeld is false when they still move down a band', () => {
    const r = dampGrowthCheckDrop({ previousTheta: 1.1, measuredTheta: 0.15, measuredSE: 0.35 });
    expect(r.levelHeld).toBe(false);
  });
});

describe('it slows a decline, it does not block one', () => {
  test('successive checks keep stepping down, one band at a time', () => {
    let theta = 1.1;                       // Algebra 1
    const seen = [];
    for (let i = 0; i < 4; i++) {
      const r = dampGrowthCheckDrop({ previousTheta: theta, measuredTheta: 0.15, measuredSE: 0.35 });
      theta = r.theta;
      seen.push(r.appliedLevel);
    }
    // Down one band per check until it meets the real measurement, then stops.
    expect(seen).toEqual(['8th Grade', '7th Grade', '6th Grade', '6th Grade']);
    expect(theta).toBeCloseTo(0.15, 5);
  });
});

describe('edges', () => {
  test('Kindergarten has no level left to protect', () => {
    const r = dampGrowthCheckDrop({ previousTheta: -2.8, measuredTheta: -3.6, measuredSE: 0.3 });
    expect(oneBandDownFloor(-2.8)).toBe(-Infinity);
    expect(r.theta).toBe(-3.6);
    expect(r.damped).toBe(false);
  });

  test('1st Grade floors into Kindergarten, which is unbounded', () => {
    const r = dampGrowthCheckDrop({ previousTheta: -2.2, measuredTheta: -6, measuredSE: 0.3 });
    expect(r.appliedLevel).toBe('Kindergarten');
  });

  test('the top of the scale is capped like everywhere else', () => {
    const r = dampGrowthCheckDrop({ previousTheta: 2.9, measuredTheta: 1.0, measuredSE: 0.3 });
    expect(r.previousLevel).toBe('Advanced Math');
    expect(r.appliedLevel).toBe('Calculus');
  });

  test('junk input degrades to something safe rather than NaN', () => {
    const r = dampGrowthCheckDrop({ previousTheta: undefined, measuredTheta: NaN, measuredSE: 'x' });
    expect(Number.isFinite(r.theta)).toBe(true);
    expect(r.damped).toBe(false);
  });
});
